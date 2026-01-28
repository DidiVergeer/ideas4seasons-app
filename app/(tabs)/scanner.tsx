import { useCameraPermissions } from "expo-camera";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import ScannerScreen from "../scanner-screen";

export default function ScannerTabRoute() {
  const [permission, requestPermission] = useCameraPermissions();
  const [requestedOnce, setRequestedOnce] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const granted = !!permission?.granted;
  const canAskAgain = permission?.canAskAgain ?? true;

  const statusText = useMemo(() => {
    if (!permission) return "Camera toestemming wordt geladen…";
    if (granted) return "Camera toestemming is gegeven.";
    if (!canAskAgain)
      return "Camera toestemming is geweigerd en iOS vraagt niet opnieuw. Zet camera-toegang aan in Instellingen.";
    return "Camera toestemming is geweigerd. Geef toestemming om te scannen.";
  }, [permission, granted, canAskAgain]);

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!granted) {
    return (
      <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "900", color: "#60715f" }}>
          Scanner
        </Text>

        <Text style={{ marginTop: 10, color: "#374151", fontSize: 14 }}>
          {statusText}
        </Text>

        {canAskAgain ? (
          <Pressable
            disabled={isRequesting}
            onPress={async () => {
              if (isRequesting) return;
              setRequestedOnce(true);
              setIsRequesting(true);
              try {
                const res = await requestPermission();
                console.log("[ScannerTab] requestPermission result:", res);
              } catch (e) {
                console.warn("[ScannerTab] requestPermission error:", e);
              } finally {
                setIsRequesting(false);
              }
            }}
            style={{
              marginTop: 16,
              backgroundColor: isRequesting ? "#34D399" : "#059669",
              paddingVertical: 12,
              borderRadius: 14,
              alignItems: "center",
              opacity: isRequesting ? 0.85 : 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              {isRequesting
                ? "Toestemming aanvragen…"
                : requestedOnce
                  ? "Opnieuw proberen"
                  : "Geef camera-toestemming"}
            </Text>
          </Pressable>
        ) : null}

        <Text style={{ marginTop: 14, color: "#6B7280", fontSize: 12 }}>
          Tip: als iOS het blokkeert, ga naar Instellingen → Privacy → Camera → Ideas4Seasons Sales.
        </Text>
      </View>
    );
  }

  // ✅ Alleen hierna mount je de echte scanner (geen permission-conflict meer)
  return <ScannerScreen />;
}
