import React, { Suspense } from "react";
import { ActivityIndicator, View } from "react-native";

const ScannerScreen = React.lazy(() => import("./scanner-screen"));

export default function ScannerRoute() {
  return (
    <Suspense
      fallback={
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      }
    >
      <ScannerScreen />
    </Suspense>
  );
}
