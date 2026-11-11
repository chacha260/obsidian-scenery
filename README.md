# Scenery

Obsidian のワークスペースの背後に「動く壁紙」を表示するプラグインです。Wallpaper Engine のように、画像・動画・Web ページ・組み込みアニメーションを壁紙にできます。

*Animated wallpapers behind your Obsidian workspace: images, videos, web pages and built-in effects. The settings UI is available in English and Japanese.*

## できること

| 種類 | 内容 |
| --- | --- |
| 画像 | png / jpg / gif / webp / avif / svg など |
| 動画 | mp4 / webm / mov など。ループ再生、音量・再生速度を調整可能 |
| Web ページ | Vault 内の `.html` または URL を背景に表示（Wallpaper Engine の Web 壁紙に近い使い方） |
| エフェクト | Aurora / Starfield / Particles / Snow。テーマのアクセントカラーに追従 |

- **ライブラリ**: Vault のファイル、フォルダ一括、URL / 絶対パスから追加
- **スライドショー**: 一定間隔で順番またはシャッフルで切り替え（クロスフェード）
- **見た目の調整**: 読みやすさ（暗幕）、サイドバーの濃さ、ぼかし、明るさ、彩度、フィット方法、マウス視差
- **省電力**: Obsidian が背面・非表示のあいだは動画とエフェクトを自動停止
- **ファイルメニュー**: 画像・動画を右クリック →「壁紙に設定」
- **コマンド**: オン/オフ、次へ、前へ、ランダム、一時停止、壁紙を選ぶ

## インストール（手動）

1. `npm install && npm run build` を実行
2. `main.js` `manifest.json` `styles.css` を `<Vault>/.obsidian/plugins/scenery/` にコピー
3. Obsidian の「設定 → コミュニティプラグイン」で **Scenery** を有効化

タグを push すると GitHub Actions がリリースを作るので、[BRAT](https://github.com/TfTHacker/obsidian42-brat) からも導入できます。

## 使い方

有効化すると Aurora エフェクトが表示されます。「設定 → Scenery」でライブラリに壁紙を追加し、「使う」を押すと切り替わります。文字が読みにくいときは「読みやすさ（暗幕）」を上げてください。

## 仕組み

- `body` の先頭に壁紙レイヤーを置き、ワークスペース各部の背景を透過させています。
- 読みやすさは、壁紙の上にテーマの背景色を半透明で重ねて確保します。テーマの配色はそのまま使われます。
- Web 壁紙は `sandbox="allow-scripts"` の iframe で表示します。スクリプトは動きますが、Vault や Obsidian 本体にはアクセスできません。

## 制限

- 壁紙はメインウィンドウのみ（ポップアウトウィンドウは未対応）
- Web 壁紙はクリックなどの操作を受け付けません
- Wallpaper Engine の Scene 形式（`.pkg`）や音声反応 API には未対応
- 独自の背景色を強く指定するテーマでは、一部のパネルが透過しないことがあります

## 開発

```bash
npm install
npm run dev
```

## ライセンス

MIT
