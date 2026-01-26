// components/products/CategoryTile.tsx

import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { Category } from "./catalog";
import { getCategoryCover } from "./covers";

export default function CategoryTile({
  item,
  onPress,
}: {
  item: Category;
  onPress: () => void;
}) {
  const src = getCategoryCover(item.id);

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
    borderRadius: 12,
    overflow: "hidden",
  },

  block: {
    width: "100%",
    aspectRatio: 1, // vierkant (hou je eigen grid)
    justifyContent: "flex-end",
    backgroundColor: "#e5ede6",
  },

  // Achtergrond vult altijd het vlak
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.35, // subtiel zodat voorgrond leidend is
    transform: [{ scale: 1.05 }], // mini-zoom om randjes door cover artifacts te voorkomen
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

  title: {
    color: "#ffffff",
    fontWeight: "900",
    fontSize: 13,
    textAlign: "left",
    padding: 10,
  },
});
