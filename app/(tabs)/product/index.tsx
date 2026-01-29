// app/(tabs)/product/index.tsx — SAFE PRODUCTS ENTRY (iOS-proof)

import { Link } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

const isIOSWeb =
  Platform.OS === "web" &&
  typeof navigator !== "undefined" &&
  /iPad|iPhone|iPod/i.test(navigator.userAgent);

export default function ProductsIndex() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Products</Text>

      {isIOSWeb ? (
        <Text style={styles.p}>
          iOS laadt producten bewust licht om crashes te voorkomen.
        </Text>
      ) : (
        <Text style={styles.p}>
          Selecteer een categorie om producten te bekijken.
        </Text>
      )}

      {/* Tijdelijk: handmatige navigation */}
      <Link href="/(tabs)/product/category" asChild>
        <Pressable style={styles.btn}>
          <Text style={styles.btnText}>Bekijk categorieën</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  h1: {
    fontSize: 24,
    fontWeight: "700",
  },
  p: {
    fontSize: 14,
    opacity: 0.8,
    textAlign: "center",
  },
  btn: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: "#111",
  },
  btnText: {
    color: "white",
    fontWeight: "700",
  },
});
