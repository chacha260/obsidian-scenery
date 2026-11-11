# 壁紙パッケージの作り方

HTML / CSS / JavaScript で Scenery 用の壁紙を作るためのガイドです。コードを書かずに作りたい場合は、README の「シーン」を参照してください。

## はじめかた

1. コマンド「Scenery: 壁紙パッケージを作成」を実行し、名前を入力します。
2. Vault の `Scenery/<名前>/` に、動くひな形（`scenery.json` と `index.html`）が作られ、そのまま壁紙として表示されます。
3. 好きなエディタで 2 つのファイルを編集します。**保存すると壁紙が自動で再読み込みされます。**

既存のフォルダを壁紙にするには、設定 → ライブラリ →「Vault のフォルダ」で `scenery.json` のあるフォルダを選びます。

## フォルダ構成

```
Scenery/my-wallpaper/
├── scenery.json   マニフェスト（必須）
├── index.html     最初に読み込まれるページ
└── …              画像・スクリプト・CSS など。index.html から相対パスで参照できます
```

## scenery.json

```json
{
  "name": "My wallpaper",
  "author": "you",
  "version": "1.0.0",
  "description": "一覧に表示される説明",
  "entry": "index.html",
  "permissions": [],
  "properties": {
    "count": { "type": "slider", "label": "粒の数", "min": 5, "max": 200, "step": 5, "default": 60 },
    "color": { "type": "color", "label": "色", "default": "#7fd4ff" },
    "trails": { "type": "toggle", "label": "残像", "default": true },
    "shape": { "type": "select", "label": "形", "options": { "glow": "光の玉", "ring": "輪" }, "default": "glow" },
    "message": { "type": "text", "label": "メッセージ", "default": "" }
  }
}
```

すべての項目は省略できます。`entry` の既定値は `index.html` です。

### properties（ユーザー設定項目）

ここに書いた項目は、Scenery の設定画面に「〈壁紙名〉の設定」として自動で表示されます。ユーザーが変えた値は壁紙ごとに保存されます。

| type | 壁紙に届く値 | 追加で指定できるもの |
| --- | --- | --- |
| `slider` | 数値 | `min`（既定 0）、`max`（既定 100）、`step`（既定 1） |
| `color` | `"#rrggbb"` の文字列 | |
| `toggle` | `true` / `false` | |
| `select` | 選ばれた値の文字列 | `options`: 値の配列、または「値: 表示名」のオブジェクト |
| `text` | 文字列 | |

どの type でも `label`（表示名）、`description`（説明）、`default`（既定値）を指定できます。範囲外の数値や、選択肢にない値は、壁紙に届く前に補正されます。

### permissions

| 値 | 意味 |
| --- | --- |
| `"note"` | 開いているノートの名前とパスを受け取りたい |

`"note"` を書くと設定画面に許可のトグルが出ます。ユーザーが許可するまで `scenery.note` は `null` です。

## API: `window.scenery`

Scenery は、ページのスクリプトより先に `scenery` オブジェクトを用意します。読み込むファイルや `<script>` タグの追加は不要です。

### `scenery.on(key, fn)`

`fn` を**その場で 1 回**、現在の値で呼び、以後は値が変わるたびに呼びます。戻り値の関数を呼ぶと購読を解除できます。

```js
scenery.on("props", function (props) {
  // 初回と、ユーザーが設定を変えるたびに呼ばれる
});
```

| key | 値 | 変わるタイミング |
| --- | --- | --- |
| `"props"` | `scenery.json` の `properties` に対応する値のオブジェクト | ユーザーが設定を変えたとき |
| `"theme"` | 下記のテーマ情報 | テーマやライト/ダークが変わったとき |
| `"pointer"` | `{ x, y }`。ウィンドウ内のポインタ位置（0〜1） | ポインタが動いたとき |
| `"paused"` | `true` / `false` | Obsidian が背面になったとき、ユーザーが一時停止したとき |
| `"note"` | `{ name, path }` または `null` | 開いているノートが変わったとき |

同じ値は `scenery.props`、`scenery.theme`、`scenery.pointer`、`scenery.paused`、`scenery.note` でいつでも読めます。

### テーマ情報

```js
{
  dark: true,                      // ダークテーマなら true
  accent: "rgb(138, 92, 245)",     // アクセントカラー
  background: "rgb(30, 30, 30)",   // 主な背景色
  backgroundAlt: "rgb(38, 38, 38)",// サイドバーなどの背景色
  text: "rgb(218, 218, 218)",      // 本文の文字色
  textMuted: "rgb(153, 153, 153)"  // 控えめな文字色
}
```

色は `rgb()` 形式なので、CSS にも canvas にもそのまま使えます。

## 知っておくこと

- **一時停止は自動です。** 一時停止中、Scenery は `requestAnimationFrame` のコールバックを保留し、再開時に流します。`requestAnimationFrame` で描画していれば、何もしなくても背面で止まります。`setInterval` や CSS アニメーション、動画は止まらないので、必要なら `"paused"` を購読してください。
- **壁紙はクリックやキー入力を受け取りません。** ワークスペースの背後にあるためです。ポインタ位置は `"pointer"` で受け取れます。
- **壁紙は隔離された枠（sandbox 付き iframe）で動きます。** Vault のファイルや Obsidian 本体には触れません。`localStorage` と cookie は使えません。保存したい値は `properties` にしてください。
- **`fetch()` でパッケージ内のファイルは読めません。** ES モジュール（`<script type="module">`）も同じ理由で動かないことがあります。画像、通常の `<script src>`、`<link rel="stylesheet">` は相対パスで読み込めます。データは `.js` ファイルに書いて `<script>` で読み込むのが確実です。
- **読みやすさの暗幕が上に重なります。** 壁紙の上にはテーマの背景色が半透明で載ります（濃さはユーザー設定）。コントラストの強い絵柄でも文字は読めますが、淡い表現は見えにくくなります。

## 配布

パッケージはただのフォルダです。zip にして渡し、受け取った人が Vault に展開して「Vault のフォルダ」から追加すれば使えます。
