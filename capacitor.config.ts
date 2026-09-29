import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.guillermooliveti.gastos",
  appName: "Gastos",
  webDir: "dist",
  android: { backgroundColor: "#07070B" },
  plugins: {
    LocalNotifications: { smallIcon: "ic_notificacion", iconColor: "#8B5CF6" },
  },
};

export default config;
