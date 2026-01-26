// components/products/SubcategoryTile.tsx

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Subcategory } from "./catalog";
import { getSubcategoryCover } from "./covers";

export default function SubcategoryTile({
  item,
  onPress,
}: {
  item: Subcategory;
  onPress: () => void;
}) {
  const src = getSubcategoryCover(item.categoryId, item.id);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      {src ? (
        <View style={styles.block}>
          {/* LAAG 1: background fill (geen witte randen) */}
          <Image source={src} style={styles.bgImage} resizeMode="cover" />

          {/* LAAG 2: hele afbeelding zichtbaar */}
          <Image source={src} style={styles.fgImage} resizeMode="contain" />

          {/* donkere balk onderin voor leesbaarheid */}
          <View style={styles.bottomBar} />
          <Text style={styles.title}>{item.name}</Text>
        </View>
      ) : (
        <View style={[styles.block, styles.fallback]}>
          <View style={styles.bottomBar} />
          <Text style={styles.title}>{item.name}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#fff",
  },

  // ✅ zelfde vorm als CategoryTile
  block: {
    width: "100%",
    aspectRatio: 1,
    justifyContent: "flex-end",
    backgroundColor: "#e5ede6",
  },

  // Achtergrond vult altijd het vlak
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.35,
    transform: [{ scale: 1.05 }],
  },

  // Voorgrond: hele afbeelding zichtbaar
  fgImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },

  fallback: {
    backgroundColor: "#e5ede6",
  },

  bottomBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 46,
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  // ✅ wit links-onder, duidelijk leesbaar
  title: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 13,
    textAlign: "left",
    padding: 10,
  },
});
