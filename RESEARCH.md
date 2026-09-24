# lib-ott-gateway research — nguồn, phát hiện, hướng cải tiến

Snapshot 2026-09-24. Research dựa trên git history của repo này (bao gồm giai
đoạn còn nằm trong monorepo Nexus dưới tên khác), code gốc `commons/ott-gateway`
trong `ace_ace_nexus-one_nodejs`, rule/memory nội bộ liên quan, và một ít
prior-art web cho phần webhook verification + default-deny. Các fact dưới đây
là snapshot tại thời điểm viết — code/quyết định có thể đã đổi tiếp sau.

## Nguồn research

**Nội bộ:**
- Repo này (`github/lib-ott-gateway`), `git log --oneline`: lịch sử hiện tại
  bắt đầu từ `a876c21 chore: initial commit — split from framework monorepo`,
  qua các bước `public-prep` (LICENSE MIT, package.json public), `ci` (GitHub
  Actions), `build` (tsc pipeline + `dist/`), rename scope `@acegalaxy/*` →
  `@kanelr/*` rồi revert lại `@acegalaxy/*` (npm Free org Unlimited Public).
- Repo mirror cũ `acegalaxy-co/ace_ace_commons-ott-gateway-nodejs` (đọc qua
  `gh repo view` + `gh api .../commits`, read-only, không clone): commit gốc
  `85516585 feat: initial source — OTT Gateway skeleton + resolver live-mode
  (Phase 2)` ghi rõ "Source copied from Nexus
  `ace_commons/ott-gateway-nodejs/` (master version với resolver live-mode
  support qua Telegram `getChatMember` API)". Tiếp theo `fe21ae8 feat: Phase A
  foundation — rules + CLI pointers + LICENSE + CHANGELOG + README`, rồi
  `9f1bfb7 merge: dev → main (Phase A foundation)`. Repo cũ định danh publish
  qua GitLab Package Registry nội bộ (`git.imba.co`, project 1228) — khác hẳn
  chiến lược git-dependency GitHub hiện tại.
- `ace_ace_nexus-one_nodejs/commons/ott-gateway`: `git log -- commons/ott-gateway`
  chỉ còn 1 commit `785aff46 chore: squash history (force-snapshot)` — lịch sử
  chi tiết trước đó đã bị squash ở tầng Nexus, không phục hồi được từ đây;
  README Nexus (`README.md:249`) liệt `ott-gateway/` trong cây `commons/` là
  "5-layer inbound security (telegram adapter)", chạy song song hệ auth cũ ở
  **log-only shadow mode** (`README.md:199`), bật qua consumer
  `src/app/llm/telegram-bot.ts` (biến `OTT_GATEWAY_SHADOW_ENABLED`, require
  `commons/ott-gateway/dist/index.js` fallback `.ts`, nuốt mọi lỗi shadow-path).
- `.claude/rules/project/system-ott.md` (Nexus): rule "07-ott-gateway-mandatory"
  — mọi inbound OTT bắt buộc qua gateway từ 2026-04-21; outbound tạm exempt
  (gateway L1 chưa có `send()`); mỗi project tự implement gateway riêng, không
  share code giữa các project ("Per-project independence").
- `.claude/memory/project_sub_git_folder.md`, `project_ai_gateway_shared_repo.md`
  (Nexus): ghi nhận pattern tách domain thành sub-repo/private git-dep tương tự
  (`ai-gateway`), làm cơ sở cho quyết định tách `ott-gateway` theo cùng mô hình.

**Ngoài (web, đã fetch thật, tên nguồn — không in domain literal trong file
này do policy nội bộ chặn host string trong nội dung được edit):**
- Trang tài liệu chính thức "Telegram Bot API" (mục `setWebhook`) — cơ chế
  `secret_token` (1–256 ký tự) gửi kèm header
  `X-Telegram-Bot-Api-Secret-Token` trên mọi request; server phải so khớp giá
  trị, thiếu/sai → từ chối. Đây là cơ sở cho phần verify webhook ở L1 adapter.
- Trang "Bot Framework — middleware concept" trên Microsoft Learn — mô hình
  middleware chắn giữa adapter và bot logic, mọi activity đi qua trước khi
  tới handler; dùng làm tham chiếu prior-art cho ý tưởng "1 entry point duy
  nhất chắn toàn bộ inbound" thay vì để mỗi handler tự check.

## Đã tham khảo gì

### Bài toán gốc trong Nexus (vì sao tách lib)

Nexus vận hành nhiều bot Telegram (nội bộ + Kane CEO briefings) nhận lệnh từ
user thật lẫn traffic không mời (DM lạ, group bị add bot vào, message
forward hàng loạt). Kiểm tra gốc chỉ dừng ở "bot đọc được message" — tức
delivery, không phải authorization. Không có tầng nào map `user_id` Telegram
sang identity/role nội bộ, không rate-limit theo identity, không audit
allow/deny tách biệt khỏi log ứng dụng chung. Rule `system-ott.md` được viết
ra chính vì lỗ hổng này, và `commons/ott-gateway` trong Nexus là implementation
đầu tiên, chạy song song (shadow) với auth path cũ để so sánh quyết định
trước khi cutover. Việc tách thành lib độc lập (`lib-ott-gateway`) tiếp nối
đúng mô hình đã làm với `ai-gateway`: domain bảo mật/hạ tầng dùng chung nhiều
project nên đáng tách khỏi monorepo Nexus, versioned + tag riêng, thay vì
copy-paste "per-project independence" như rule cũ chủ trương.

### Ý tưởng thiết kế chính — 5-layer default-deny

`dispatchInbound(rawPayload, platform, headers)` là entry point duy nhất, đi
qua đủ 5 layer theo thứ tự, mỗi layer có quyền `deny` và deny là mặc định
(phải allowlist tường minh):

1. **L1 Adapter** — verify chữ ký/webhook secret theo platform, parse raw
   payload thành `InboundMessage` chuẩn hoá. Đây chính là chỗ áp dụng cơ chế
   `secret_token` của Telegram nói trên.
2. **L2 Identity** — map principal platform (`telegram:user_id`) sang identity
   nội bộ; unknown principal → deny. 3 mode: static (env map), live
   (`getChatMember`), hybrid.
3. **L3 Authz** — role-based ACL theo platform/command/chat, policy thiếu →
   deny (không có nghĩa là allow-by-omission).
4. **L4 Rate-limit + replay guard** — sliding window theo identity (không
   theo IP, vì bot nhận traffic qua long-poll/webhook chung 1 IP), dedup
   `message_id` để replay không ăn quota.
5. **L5 Audit** — append-only JSONL ghi mọi allow/deny kèm `denyReason` +
   `latencyMs`.

`dispatchInbound` không bao giờ throw — luôn trả `{ outcome, denyReason,
latencyMs }`, để consumer không cần try/catch riêng cho từng layer.

### Prior art & vì sao tự viết

So sánh với middleware pattern của Bot Framework (Microsoft) — cùng triết lý
"1 điểm chắn giữa adapter và handler" — nhưng các framework bot phổ biến
(node-telegram-bot-api, Telegraf, Bot Framework SDK) chỉ cung cấp verify chữ
ký/webhook ở mức transport (tương đương L1), không có identity-mapping +
role-authz + rate-limit + audit tích hợp sẵn thành 1 chain default-deny. Yêu
cầu domain-specific (map sang identity nội bộ Nexus, policy theo role công
ty, audit log format riêng cho compliance nội bộ) khiến việc build 4 layer
còn lại (L2–L5) trên nền 1 adapter mỏng rẻ hơn và kiểm soát được hơn so với
kéo thêm 1 framework ngoài chỉ để dùng phần L1. Quyết định giữ zero deps
ngoài `@acegalaxy/lib-security-utils` (audit-log + rate-limit primitives)
nằm trong hướng đó.

## Hướng cải tiến

**Đã áp dụng:**
- `v0.2.0`: audit log path chuyển từ hardcode sang `OTT_AUDIT_LOG_PATH` env,
  fallback `path.join(process.cwd(), "logs", "ott-gateway-audit.log")` (mkdir
  -p on demand), **không bao giờ** dùng `__dirname` — tránh ghi log vào
  `node_modules` khi consume như dependency.
- `OTT_POLICY_DIR` env cho phép override thư mục policy L3, fallback bundled
  `dist/authz/policies/` — cần thiết vì trước đó policy path gắn cứng theo vị
  trí source trong monorepo, không hoạt động khi cài như package.
- Đổi tên package + repo sang tiền tố `lib-` (`@acegalaxy/lib-ott-gateway`,
  `acegalaxy-co/lib-ott-gateway`) theo quyết định chuẩn hoá naming
  2026-09-24 cho toàn bộ thư viện nội bộ `@acegalaxy/*`.
- Chuyển sang private git-dependency (`github:acegalaxy-co/lib-ott-gateway#v0.2.0`)
  thay vì GitLab Package Registry nội bộ như repo mirror cũ từng định hướng —
  đơn giản hoá install cho consumer, không cần registry riêng.
- Build pipeline `tsc` + `dist/` cho npm publish, CI (GitHub Actions), smoke
  test tối thiểu — các hạng mục "Phase B/C pending" ghi trong lịch sử repo cũ
  nay đã có mặt.

**Deferred / chưa implement:**
- Chỉ có adapter Telegram (`adapters/telegram.ts`); WhatsApp/Teams/Slack/
  Discord/WeChat từng được liệt trong scope rule `system-ott.md` nhưng chưa
  có adapter thật nào ngoài Telegram — README repo mirror cũ liệt các
  platform này nhưng đó là mô tả mục tiêu, không phải trạng thái đã build.
- Outbound (`adapter.send()`) vẫn cố tình throw — chain gateway chỉ chắn
  inbound; outbound tiếp tục nằm ở tầng riêng của project tiêu thụ (đúng theo
  "Phase 3 roadmap" ghi trong rule Nexus, chưa ai bắt đầu).
- Test hiện tại (`test/L1-adapter.test.js` … `test/L5-audit.test.js`,
  `test/dispatch.test.js`) chưa được đối chiếu lại với bộ 6 file/45 case của
  Nexus (`test/modules/ott-gateway-*.test.js`) — việc port đầy đủ nằm trong
  scope task #63 song song với research này, chưa xác nhận xong tại thời
  điểm viết.
- Không có test tích hợp cho identity mode `live` (gọi `getChatMember` thật)
  — mode này phụ thuộc mạng/token thật, hiện chỉ test được static/hybrid với
  mock.
- Chưa có cơ chế tự động rotate/invalidate `OTT_IDENTITY_MAP` hay policy khi
  nhân sự đổi role — vẫn là thao tác sửa env/file thủ công.
