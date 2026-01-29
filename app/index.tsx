// app/index.tsx — SAFE BOOT LANDING (geen auto-redirect)

import { Link } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Ideas4Seasons</Text>
      <Text style={styles.p}>Start veilig (iOS/PWA).</Text>

      <Link href="/login" asChild>
        <Pressable style={styles.btn}>
          <Text style={styles.btnText}>Ga naar login</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  h1: { fontSize: 28, fontWeight: "700" },
  p: { fontSize: 14, opacity: 0.8 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, backgroundColor: "#111", minWidth: 220 },
  btnText: { color: "white", fontWeight: "700", textAlign: "center" },
});
