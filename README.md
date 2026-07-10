# 入管申請管理システム

外国人の入管申請業務をスマートフォンだけで完結できるようにする社内向け申請管理システムです。
Google スプレッドシート・Google Drive・Notion と連携し、OCR による入力自動化と、社内全員がリアルタイムに進捗を確認できる仕組みを提供します。

## ドキュメント

- [システム全体設計](docs/00_system_design.md)
- [認証情報セットアップ手順](docs/01_credentials_setup.md)

## 開発の進め方

1. システム全体の設計 ✅
2. 画面デザイン作成 ✅（ダミーデータで動作確認中）
3. Google ログイン
4. Google スプレッドシート連携
5. Google Drive 画像保存
6. OCR 実装
7. Notion 連携
8. LINE 報告文作成
9. 通知書検索
10. ステータス管理
11. ダッシュボード
12. 最終テスト

## ローカルでの起動方法

```bash
npm install
npm run dev
```

`http://localhost:3000` で確認できます。
