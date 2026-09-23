// Emulator の操作（08 §3.3.2）。REST エンドポイントでデータを空にする（02 §13.3）
const projectId = () => process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-tekisei";
const firestoreHost = () => process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const authHost = () => process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";

export async function clearEmulators(): Promise<void> {
  const responses = await Promise.all([
    fetch(
      `http://${firestoreHost()}/emulator/v1/projects/${projectId()}/databases/(default)/documents`,
      {
        method: "DELETE",
      },
    ),
    fetch(`http://${authHost()}/emulator/v1/projects/${projectId()}/accounts`, {
      method: "DELETE",
    }),
  ]);
  for (const res of responses) {
    if (!res.ok) throw new Error(`Emulator のクリアに失敗しました: ${res.status} ${res.url}`);
  }
}

/** Auth Emulator の REST でメール＋パスワードでログインし ID トークンを得る（ブラウザの signInWithEmailAndPassword 相当） */
export async function signInWithPassword(email: string, password: string): Promise<string> {
  const res = await fetch(
    `http://${authHost()}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (!res.ok || !body.idToken)
    throw new Error(`ログインに失敗しました: ${body.error?.message ?? res.status}`);
  return body.idToken;
}
