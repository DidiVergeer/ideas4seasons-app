// app/+html.tsx
import { Head, Html, Main, NextScript } from "expo-router/html";

export default function RootHtml() {
  return (
    <Html lang="nl">
      <Head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon.png" />
        <meta name="format-detection" content="telephone=no" />

        {/* ✅ Service worker registreren bij cold start */}
        <script src="/register-sw.js" defer></script>
      </Head>

      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
