"""Synthetic population grid for demo-grade impact-risk assessment.

This is the **demo-grade** path. The architectural pattern matches
production planetary defense (Liu et al. 2025 Nature on YR4 risk:
they use the CIESIN GPWv4 1° gridded population raster) — only the
data source is synthetic. The frontend banners this prominently.

Phase 2 of the production-readiness roadmap (docs/production-readiness-
roadmap.md) swaps this module for a real CIESIN GPWv4 GeoTIFF reader
behind the same `population_in_circle` API. No callers change.

Construction:
  - Hand-curated top-50 metropolitan areas by population (Wikipedia,
    2023 metro figures). Each city is one point with metro population.
  - Population in a damage circle = sum of (cities whose center falls
    inside the circle) + background rural density × circle area.
  - Background density = 12 people/km² (rough world average outside
    metros; balances oceans where density ≈ 0 against rural land).

Tradeoff acknowledged: a small damage radius that *just misses* a
metro center returns only background population, which underestimates
real harm. Production-grade would convolve a 1° density raster with
the damage circle. We label this 'demo-grade' in the UI for honesty.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

EARTH_RADIUS_KM = 6371.0
BACKGROUND_DENSITY_PER_KM2 = 12.0
GRID_SOURCE_LABEL = "synthetic-top50-cities-v1 (demo-grade)"
GRID_SOURCE_NOTE = (
    "Demo-grade synthetic 1° grid built from the 50 most populous"
    " metropolitan areas (Wikipedia, 2023 metro figures). Phase 2 will"
    " swap this for the CIESIN GPWv4 production raster."
)


@dataclass(frozen=True)
class City:
    name: str
    country: str
    latitude_deg: float
    longitude_deg: float
    metro_population: int


# Top 50 metropolitan areas by population (2023 estimates, public
# Wikipedia data). Numbers rounded to the nearest 100k.
TOP_CITIES: tuple[City, ...] = (
    City("Tokyo", "Japan", 35.6762, 139.6503, 37_400_000),
    City("Delhi", "India", 28.7041, 77.1025, 32_900_000),
    City("Shanghai", "China", 31.2304, 121.4737, 28_500_000),
    City("Dhaka", "Bangladesh", 23.8103, 90.4125, 22_500_000),
    City("Sao Paulo", "Brazil", -23.5505, -46.6333, 22_600_000),
    City("Mexico City", "Mexico", 19.4326, -99.1332, 22_500_000),
    City("Cairo", "Egypt", 30.0444, 31.2357, 22_200_000),
    City("Beijing", "China", 39.9042, 116.4074, 21_500_000),
    City("Mumbai", "India", 19.0760, 72.8777, 21_400_000),
    City("Osaka", "Japan", 34.6937, 135.5023, 19_000_000),
    City("New York", "United States", 40.7128, -74.0060, 18_800_000),
    City("Karachi", "Pakistan", 24.8607, 67.0011, 16_900_000),
    City("Chongqing", "China", 29.4316, 106.9123, 15_900_000),
    City("Istanbul", "Turkey", 41.0082, 28.9784, 15_500_000),
    City("Buenos Aires", "Argentina", -34.6037, -58.3816, 15_400_000),
    City("Kolkata", "India", 22.5726, 88.3639, 15_000_000),
    City("Manila", "Philippines", 14.5995, 120.9842, 14_400_000),
    City("Lagos", "Nigeria", 6.5244, 3.3792, 14_400_000),
    City("Kinshasa", "DR Congo", -4.4419, 15.2663, 14_300_000),
    City("Tianjin", "China", 39.0842, 117.2009, 13_600_000),
    City("Guangzhou", "China", 23.1291, 113.2644, 13_600_000),
    City("Rio de Janeiro", "Brazil", -22.9068, -43.1729, 13_500_000),
    City("Los Angeles", "United States", 34.0522, -118.2437, 13_200_000),
    City("Lahore", "Pakistan", 31.5204, 74.3587, 13_100_000),
    City("Moscow", "Russia", 55.7558, 37.6173, 12_500_000),
    City("Shenzhen", "China", 22.5431, 114.0579, 12_400_000),
    City("Bangalore", "India", 12.9716, 77.5946, 12_300_000),
    City("Paris", "France", 48.8566, 2.3522, 11_000_000),
    City("Bogota", "Colombia", 4.7110, -74.0721, 10_800_000),
    City("Lima", "Peru", -12.0464, -77.0428, 10_700_000),
    City("Jakarta", "Indonesia", -6.2088, 106.8456, 10_600_000),
    City("Chennai", "India", 13.0827, 80.2707, 10_500_000),
    City("Bangkok", "Thailand", 13.7563, 100.5018, 10_500_000),
    City("Hyderabad", "India", 17.3850, 78.4867, 10_000_000),
    City("Seoul", "South Korea", 37.5665, 126.9780, 9_700_000),
    City("Nagoya", "Japan", 35.1815, 136.9066, 9_500_000),
    City("London", "United Kingdom", 51.5074, -0.1278, 9_500_000),
    City("Chengdu", "China", 30.5728, 104.0668, 9_500_000),
    City("Nanjing", "China", 32.0603, 118.7969, 9_400_000),
    City("Wuhan", "China", 30.5928, 114.3055, 9_000_000),
    City("Ho Chi Minh City", "Vietnam", 10.8231, 106.6297, 9_000_000),
    City("Tehran", "Iran", 35.6892, 51.3890, 9_000_000),
    City("Chicago", "United States", 41.8781, -87.6298, 8_900_000),
    City("Kuala Lumpur", "Malaysia", 3.1390, 101.6869, 8_400_000),
    City("Hanoi", "Vietnam", 21.0285, 105.8542, 8_000_000),
    City("Ahmedabad", "India", 23.0225, 72.5714, 8_000_000),
    City("Luanda", "Angola", -8.8390, 13.2894, 8_000_000),
    City("Riyadh", "Saudi Arabia", 24.7136, 46.6753, 7_700_000),
    City("Hong Kong", "China", 22.3193, 114.1694, 7_500_000),
    City("Dongguan", "China", 23.0207, 113.7518, 7_400_000),
)


def haversine_km(
    lat1_deg: float, lon1_deg: float, lat2_deg: float, lon2_deg: float
) -> float:
    """Great-circle distance in kilometers."""
    phi1 = math.radians(lat1_deg)
    phi2 = math.radians(lat2_deg)
    dphi = math.radians(lat2_deg - lat1_deg)
    dlmb = math.radians(lon2_deg - lon1_deg)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def population_in_circle(
    center_lat_deg: float, center_lon_deg: float, radius_km: float
) -> dict[str, float | int | str | list[str]]:
    """Return demo-grade population estimate inside a damage circle.

    Returns:
        {
          "population_in_zone": int,
          "circle_area_km2": float,
          "cities_in_zone": list[str],
          "metro_population_in_zone": int,
          "background_population_in_zone": int,
          "source": str,
        }
    """
    if radius_km <= 0:
        return {
            "population_in_zone": 0,
            "circle_area_km2": 0.0,
            "cities_in_zone": [],
            "metro_population_in_zone": 0,
            "background_population_in_zone": 0,
            "source": GRID_SOURCE_LABEL,
        }
    cities_in: list[str] = []
    metro_pop_in = 0
    for city in TOP_CITIES:
        d = haversine_km(
            center_lat_deg, center_lon_deg, city.latitude_deg, city.longitude_deg
        )
        if d <= radius_km:
            cities_in.append(f"{city.name} ({city.country})")
            metro_pop_in += city.metro_population
    area_km2 = math.pi * radius_km * radius_km
    background_pop = int(BACKGROUND_DENSITY_PER_KM2 * area_km2)
    return {
        "population_in_zone": metro_pop_in + background_pop,
        "circle_area_km2": area_km2,
        "cities_in_zone": cities_in,
        "metro_population_in_zone": metro_pop_in,
        "background_population_in_zone": background_pop,
        "source": GRID_SOURCE_LABEL,
    }


def population_density_at(latitude_deg: float, longitude_deg: float) -> float:
    """Return demo-grade local density in people/km² at a point.

    Used for the ImpactCorridor2D city-overlay scaling. Within ~50km of
    a top-50 metro the density approaches the metro's own density;
    outside that we return the background.
    """
    best_density = BACKGROUND_DENSITY_PER_KM2
    for city in TOP_CITIES:
        d = haversine_km(
            latitude_deg, longitude_deg, city.latitude_deg, city.longitude_deg
        )
        if d <= 50.0:
            # Naive uniform metro density assumption: pop / (π * 30km²).
            density = city.metro_population / (math.pi * 30.0 * 30.0)
            if density > best_density:
                best_density = density
    return best_density
