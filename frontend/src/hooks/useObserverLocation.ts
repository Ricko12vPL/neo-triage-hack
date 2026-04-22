import { useState } from "react";

export interface ObserverLocation {
  label: string;
  latitude_deg: number;
  longitude_deg: number;
}

export const OBSERVER_PRESETS: ObserverLocation[] = [
  { label: "Mauna Kea", latitude_deg: 19.82, longitude_deg: -155.47 },
  { label: "Warsaw", latitude_deg: 52.23, longitude_deg: 21.01 },
  { label: "Cerro Tololo", latitude_deg: -30.17, longitude_deg: -70.81 },
  { label: "La Palma", latitude_deg: 28.76, longitude_deg: -17.89 },
];

const STORAGE_KEY = "neo_triage_observer_location";

function loadFromStorage(): ObserverLocation {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ObserverLocation;
  } catch {
    // corrupted — fall through to default
  }
  return OBSERVER_PRESETS[0]; // default: Mauna Kea
}

export function useObserverLocation() {
  const [location, setLocationState] = useState<ObserverLocation>(loadFromStorage);

  function setLocation(loc: ObserverLocation) {
    setLocationState(loc);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } catch {
      // storage full — in-memory only
    }
  }

  return { location, setLocation };
}
