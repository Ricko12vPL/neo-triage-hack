/**
 * Top-30 metropolitan areas by population — used by the impact-corridor
 * map as the population reference layer. Coordinates from Wikipedia
 * 2023 figures; metro population is the urban-area definition (not
 * city-proper).
 *
 * Mirrors backend.services.population_risk.TOP_CITIES so client-side
 * dot rendering matches what the backend's population-in-zone count
 * uses. Country added so hover tooltips can be operator-friendly.
 */

export interface City {
  name: string;
  country: string;
  latitude_deg: number;
  longitude_deg: number;
  metro_population: number;
}

export const TOP_CITIES: City[] = [
  { name: "Tokyo", country: "Japan", latitude_deg: 35.68, longitude_deg: 139.65, metro_population: 37_400_000 },
  { name: "Delhi", country: "India", latitude_deg: 28.7, longitude_deg: 77.1, metro_population: 32_900_000 },
  { name: "Shanghai", country: "China", latitude_deg: 31.23, longitude_deg: 121.47, metro_population: 28_500_000 },
  { name: "Dhaka", country: "Bangladesh", latitude_deg: 23.81, longitude_deg: 90.41, metro_population: 22_500_000 },
  { name: "São Paulo", country: "Brazil", latitude_deg: -23.55, longitude_deg: -46.63, metro_population: 22_600_000 },
  { name: "Mexico City", country: "Mexico", latitude_deg: 19.43, longitude_deg: -99.13, metro_population: 22_500_000 },
  { name: "Cairo", country: "Egypt", latitude_deg: 30.04, longitude_deg: 31.24, metro_population: 22_200_000 },
  { name: "Beijing", country: "China", latitude_deg: 39.9, longitude_deg: 116.41, metro_population: 21_500_000 },
  { name: "Mumbai", country: "India", latitude_deg: 19.08, longitude_deg: 72.88, metro_population: 21_400_000 },
  { name: "Osaka", country: "Japan", latitude_deg: 34.69, longitude_deg: 135.5, metro_population: 19_000_000 },
  { name: "New York", country: "USA", latitude_deg: 40.71, longitude_deg: -74.01, metro_population: 18_800_000 },
  { name: "Karachi", country: "Pakistan", latitude_deg: 24.86, longitude_deg: 67.0, metro_population: 16_900_000 },
  { name: "Buenos Aires", country: "Argentina", latitude_deg: -34.6, longitude_deg: -58.38, metro_population: 15_400_000 },
  { name: "Istanbul", country: "Türkiye", latitude_deg: 41.01, longitude_deg: 28.98, metro_population: 15_500_000 },
  { name: "Manila", country: "Philippines", latitude_deg: 14.6, longitude_deg: 120.98, metro_population: 14_400_000 },
  { name: "Lagos", country: "Nigeria", latitude_deg: 6.52, longitude_deg: 3.38, metro_population: 14_400_000 },
  { name: "Kinshasa", country: "DRC", latitude_deg: -4.44, longitude_deg: 15.27, metro_population: 14_300_000 },
  { name: "Rio de Janeiro", country: "Brazil", latitude_deg: -22.91, longitude_deg: -43.17, metro_population: 13_500_000 },
  { name: "Los Angeles", country: "USA", latitude_deg: 34.05, longitude_deg: -118.24, metro_population: 13_200_000 },
  { name: "Moscow", country: "Russia", latitude_deg: 55.76, longitude_deg: 37.62, metro_population: 12_500_000 },
  { name: "Bangalore", country: "India", latitude_deg: 12.97, longitude_deg: 77.59, metro_population: 12_300_000 },
  { name: "Paris", country: "France", latitude_deg: 48.86, longitude_deg: 2.35, metro_population: 11_000_000 },
  { name: "Lima", country: "Peru", latitude_deg: -12.05, longitude_deg: -77.04, metro_population: 10_700_000 },
  { name: "Bangkok", country: "Thailand", latitude_deg: 13.76, longitude_deg: 100.5, metro_population: 10_500_000 },
  { name: "Jakarta", country: "Indonesia", latitude_deg: -6.21, longitude_deg: 106.85, metro_population: 10_600_000 },
  { name: "Seoul", country: "South Korea", latitude_deg: 37.57, longitude_deg: 126.98, metro_population: 9_700_000 },
  { name: "London", country: "United Kingdom", latitude_deg: 51.51, longitude_deg: -0.13, metro_population: 9_500_000 },
  { name: "Tehran", country: "Iran", latitude_deg: 35.69, longitude_deg: 51.39, metro_population: 9_000_000 },
  { name: "Chicago", country: "USA", latitude_deg: 41.88, longitude_deg: -87.63, metro_population: 8_900_000 },
  { name: "Sydney", country: "Australia", latitude_deg: -33.87, longitude_deg: 151.21, metro_population: 5_400_000 },
];
