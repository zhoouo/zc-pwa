# Couple Ledger

一個給兩個人使用的情侶 PWA 原型。

目前版本已經是「可直接使用的 Demo + 可接正式資料層的骨架」。

已完成的主循環：

- 發任務
- 送出審核
- 通過後發金幣
- 用金幣在商城兌換項目
- 追蹤兌換單後續狀態
- 正式設定頁骨架
- 頭像 + 暱稱顯示

## 技術棧

- Vue 3
- Vite
- TypeScript
- Tailwind CSS
- vite-plugin-pwa

## 啟動方式

```bash
npm install
npm run build
```

本次交付時，已經額外用靜態方式將 `dist` 內容提供在本機可瀏覽狀態。

預設可打開：

- `http://127.0.0.1:4173`

## Supabase 環境變數

如果要開啟正式帳號流程，請建立 `.env`：

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

參考檔案：

- [.env.example](</D:/鼻/.env.example>)

## Supabase Schema

已先提供第一版資料表草稿：

- [supabase/schema.sql](</D:/鼻/supabase/schema.sql>)

## 目前完成內容

- 米色、細線、毛玻璃風格的雙人介面
- 首頁總覽
- 任務建立 / 送審 / 通過 / 退回
- 金幣餘額與流水
- 商城建立 / 兌換
- 隱藏商城入口
- 兌換單狀態更新
- 有暱稱的地方補上頭像顯示
- 正式設定頁分區：帳號 / 頭像與暱稱 / 綁定資訊 / 視覺細節 / 空間狀態
- Supabase-ready client 與 auth 骨架
- PWA manifest 與 icon

## 目前限制

- 資料存在本機 `localStorage`
- 若未提供 Supabase env，帳號區會維持 Demo 提示
- 任務 / 商城 / 金幣主資料目前仍是本機 state，尚未同步到 Supabase
- 尚未做真正的配對與跨裝置同步
- 尚未做推播通知

## 下一步建議

1. 接入 Supabase Auth
2. 建立 `profiles / couples / tasks / ledger_entries / shop_items / redemptions`
3. 用 RLS 保護雙人資料
4. 將目前 [useCoupleApp.ts](</D:/鼻/src/composables/useCoupleApp.ts>) 的本機儲存替換成 database adapter
5. 補上照片證明、推播與正式配對流程
