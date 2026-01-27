import { useCameraPermissions } from "expo-camera";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import ScannerScreen from "../scanner-screen";

export default function ScannerTabRoute() {
  const [permission, requestPermission] = useCameraPermissions();
  const [requestedOnce, setRequestedOnce] = useState(false);

  const granted = !!permission?.granted;

  const statusText = useMemo(() => {
    if (!permission) return "Camera toestemming is nodig om barcodes te scannen.";
    if (granted) return "Camera toestemming is gegeven.";
    return "Camera toestemming is geweigerd. Geef toestemming om te scannen.";
  }, [permission, granted]);

  // ✅ Nog niet geladen / status onbekend
  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // ✅ Geen toestemming → eerst permissie scherm
  if (!granted) {
    return (
      <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#60715f" }}>
          Scanner
        </Text>

        <Text style={{ marginTop: 10, color: "#374151", fontSize: 14 }}>
          {statusText}
        </Text>

        <Pressable
          onPress={async () => {
            setRequestedOnce(true);
            await requestPermission();
          }}
          style={{
            marginTop: 16,
            backgroundColor: "#059669",
            paddingVertical: 12,
            borderRadius: 14,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "white", fontWeight: "900" }}>
            {requestedOnce ? "Opnieuw proberen" : "Geef camera-toestemming"}
          </Text>
        </Pressable>

        <Text style={{ marginTop: 14, color: "#6B7280", fontSize: 12 }}>
          Tip: als iOS het blokkeert, ga naar Instellingen → Privacy → Camera → Ideas4Seasons Sales.
        </Text>
      </View>
    );
  }

  // ✅ Toestemming gegeven → nu pas echte scanner laden
  return <ScannerScreen />;
}
