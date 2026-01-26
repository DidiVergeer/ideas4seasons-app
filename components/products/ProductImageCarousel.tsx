import React, { useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  images?: Array<string | null | undefined>;
  max?: number; // default 5 (sfeer_1..5)
  height?: number; // default 280
};

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

function normalizeImages(images?: Array<string | null | undefined>, max = 5) {
  const cleaned = (images ?? [])
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter((s) => s.length > 0);

  // dedupe (voorkomt dubbele dots)
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const u of cleaned) {
    if (seen.has(u)) continue;
    seen.add(u);
    unique.push(u);
  }

  return unique.slice(0, max);
}

export default function ProductImageCarousel({ images, max = 5, height = 280 }: Props) {
  const data = useMemo(() => normalizeImages(images, max), [images, max]);
  const [index, setIndex] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  const inlineRef = useRef<FlatList<string>>(null);
  const modalRef = useRef<FlatList<string>>(null);

  const safeSetIndexFromOffset = (x: number) => {
    const i = Math.round(x / SCREEN_W);
    const clamped = Math.max(0, Math.min(data.length - 1, i));
    setIndex(clamped);
  };

  const openModalAt = (i: number) => {
    const clamped = Math.max(0, Math.min(data.length - 1, i));
    setIndex(clamped);
    setModalOpen(true);

    // scroll modal to index after it mounts
    setTimeout(() => {
      modalRef.current?.scrollToIndex({ index: clamped, animated: false });
    }, 0);
  };

  const goTo = (i: number) => {
    const clamped = Math.max(0, Math.min(data.length - 1, i));
    setIndex(clamped);
    inlineRef.current?.scrollToIndex({ index: clamped, animated: true });
  };

  if (data.length === 0) {
    return (
      <View style={[styles.placeholder, { height }]}>
        <Text style={styles.placeholderText}>No images</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { height }]}>
      {/* ✅ Inline carousel (always has height) */}
      <FlatList
        ref={inlineRef}
        data={data}
        keyExtractor={(item, i) => `${i}-${item}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ height }}
        contentContainerStyle={{ height }}
        getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
        onMomentumScrollEnd={(e) => {
          const x = e?.nativeEvent?.contentOffset?.x ?? 0;
          safeSetIndexFromOffset(x);
        }}
        renderItem={({ item, index: i }) => (
          <Pressable
            onPress={() => openModalAt(i)}
            style={{ width: SCREEN_W, height }}
          >
            <Image source={{ uri: item }} style={[styles.image, { height }]} resizeMode="contain" />
          </Pressable>
        )}
      />

      {/* ✅ Dots overlay (like your screenshot) */}
      <View pointerEvents="box-none" style={styles.dotsOverlay}>
        <View style={styles.dotsRow}>
          {data.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={10}>
              <View style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* ✅ Fullscreen modal */}
      <Modal visible={modalOpen} transparent={false} animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalContainer}>
          <Pressable style={styles.modalClose} onPress={() => setModalOpen(false)}>
            <Text style={styles.modalCloseText}>Close</Text>
          </Pressable>

          <FlatList
            ref={modalRef}
            data={data}
            keyExtractor={(item, i) => `modal-${i}-${item}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            onMomentumScrollEnd={(e) => {
              const x = e?.nativeEvent?.contentOffset?.x ?? 0;
              safeSetIndexFromOffset(x);
            }}
            renderItem={({ item }) => (
              <View style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: "center" }}>
                <Image source={{ uri: item }} style={styles.modalImage} resizeMode="contain" />
              </View>
            )}
          />

          <View style={styles.modalDotsRow}>
            {data.map((_, i) => (
              <View key={i} style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]} />
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: "#F6F7F9",
    overflow: "hidden",
  },
  image: {
    width: SCREEN_W,
    backgroundColor: "#F6F7F9",
  },
  placeholder: {
    width: "100%",
    backgroundColor: "#F6F7F9",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#6B7280",
  },

  // dots overlay under image (like screenshot)
  dotsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: "center",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 99,
  },
  dotActive: { backgroundColor: "#111827" },
  dotInactive: { backgroundColor: "#D1D5DB" },

  modalContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  modalClose: {
    position: "absolute",
    zIndex: 10,
    top: 50,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  modalCloseText: {
    color: "#fff",
    fontWeight: "600",
  },
  modalImage: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  modalDotsRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 26,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
});
