import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Row = { label: string; value?: string | number | null | undefined };

type Section = {
  title: string;
  rows: Row[];
};

type Props = {
  itemInformation: {
    unit?: string | null;
    innerCarton?: number | string | null;
    outerCarton?: number | string | null;
    pallet?: number | string | null; // ✅ NEW
  };
  stockInformation: {
    availableStock?: number | string | null;
    onOrderQty?: number | string | null;
    expectedDate?: string | null; // keep as string for now
    economicStock?: number | string | null;
  };
};

function renderValue(v: Row["value"]) {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function SectionBlock({ section }: { section: Section }) {
  const [open, setOpen] = useState(true);

  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={() => setOpen((s) => !s)}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.chevron}>{open ? "▾" : "▸"}</Text>
      </Pressable>

      {open && (
        <View style={styles.sectionBody}>
          {section.rows.map((r, idx) => (
            <View key={idx} style={styles.row}>
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{renderValue(r.value)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ProductAccordion({ itemInformation, stockInformation }: Props) {
  const sections = useMemo<Section[]>(
    () => [
      {
        title: "Item information",
        rows: [
          { label: "Unit", value: itemInformation.unit },
          { label: "Innercarton", value: itemInformation.innerCarton },
          { label: "Outercarton", value: itemInformation.outerCarton },
          { label: "Pallet", value: itemInformation.pallet }, // ✅ ALTIJD TONEN
        ],
      },
      {
        title: "Stock information",
        rows: [
          { label: "Beschikbare voorraad", value: stockInformation.availableStock },
          {
            label: "In bestelling",
            value:
              stockInformation.onOrderQty != null
                ? `${stockInformation.onOrderQty}${
                    stockInformation.expectedDate ? ` (ETA: ${stockInformation.expectedDate})` : ""
                  }`
                : "-",
          },
          { label: "Economische voorraad", value: stockInformation.economicStock },
        ],
      },
    ],
    [itemInformation, stockInformation]
  );

  return (
    <View style={styles.container}>
      {sections.map((s, i) => (
        <SectionBlock key={i} section={s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  section: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  sectionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
  },
  sectionTitle: {
    fontWeight: "700",
    color: "#111827",
  },
  chevron: {
    color: "#111827",
    fontSize: 16,
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  rowLabel: {
    color: "#374151",
    flex: 1,
  },
  rowValue: {
    color: "#111827",
    fontWeight: "600",
    textAlign: "right",
  },
});
