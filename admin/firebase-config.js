/* Firebaseの設定（ここを埋めると、本物のログインとチーム共有が有効になります）
   空のままなら、これまで通りの「仮ログイン（このブラウザだけに保存）」で動きます。
   設定のしかたは、リポジトリの README.md の「管理者画面を本物にする」を見てください。

   Firebaseの設定値（apiKeyなど）は、公開されても問題ない種類の値です。
   守るのは、firestore.rules の「許可するメールアドレス」です。 */
window.TSUKA_FIREBASE = null;

/* 例（Firebaseコンソールに表示された値を貼り付ける）:
window.TSUKA_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  appId: "1:1234567890:web:abcdef"
};
*/
