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

- 尚未做推播通知
