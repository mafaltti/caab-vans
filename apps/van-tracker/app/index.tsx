import { Redirect } from "expo-router";

export default function HomeScreen() {
  // Redirect to bootstrap gate — the root layout handles navigation
  return <Redirect href="/(driver)" />;
}
