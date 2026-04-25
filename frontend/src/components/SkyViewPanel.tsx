import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls, Stars, Html } from "@react-three/drei";
import * as THREE from "three";
import type { RankedCandidate } from "../api/types";
import { radec_to_xyz } from "../lib/celestial";
import { computeTorinoFromCandidate } from "../lib/torino";
import { FAMOUS_NEOS, type FamousNEO } from "../lib/famous_neos";
import {
  computeMotionEnvelope,
  computeUncertaintyCone,
  hashTrksub,
} from "../lib/proper_motion";
import {
  currentJD,
  earthHeliocentricAtJD,
  heliocentricPositionAtJD,
  heliocentricToGeocentricCelestialSphere,
  orbitGroundTrack,
} from "../lib/kepler";

interface Props {
  candidates: RankedCandidate[];
  selectedTrksub: string | null;
  onCandidateClick: (trksub: string) => void;
  onFamousNEOClick?: (designation: string) => void;
  selectedFamousNEODesignation?: string | null;
  /** Fired when the user clicks empty sky — used to dismiss the active orbit. */
  onDeselect?: () => void;
  /**
   * F-7: when false, the famous-NEO layer and background 12k-point field
   * are not rendered so the view reduces to Earth + grid + primary
   * candidates — useful for "this is what we care about tonight" framing.
   */
  showContext?: boolean;
}

const SPHERE_RADIUS = 4;
const EARTH_RADIUS = 0.6;

function Earth() {
  const earthRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);

  const [colorMap, specMap, lightsMap, cloudsMap] = useLoader(
    THREE.TextureLoader,
    [
      "/textures/earth_atmos_2048.jpg",
      "/textures/earth_specular_2048.jpg",
      "/textures/earth_lights_2048.png",
      "/textures/earth_clouds_1024.png",
    ],
  );

  useFrame((_, delta) => {
    if (earthRef.current) earthRef.current.rotation.y += delta * 0.03;
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.045;
  });

  return (
    <group>
      <mesh ref={earthRef}>
        <sphereGeometry args={[EARTH_RADIUS, 96, 96]} />
        <meshStandardMaterial
          map={colorMap}
          roughnessMap={specMap}
          roughness={0.85}
          metalness={0.05}
          emissiveMap={lightsMap}
          emissive="#ffbb66"
          emissiveIntensity={0.55}
        />
      </mesh>

      <mesh ref={cloudsRef}>
        <sphereGeometry args={[EARTH_RADIUS * 1.012, 96, 96]} />
        <meshStandardMaterial
          map={cloudsMap}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.05, 64, 64]} />
        <meshBasicMaterial
          color="#4aa8ff"
          transparent
          opacity={0.18}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.14, 64, 64]} />
        <meshBasicMaterial
          color="#6ac0ff"
          transparent
          opacity={0.07}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Deterministic seeded PRNG (mulberry32) — keeps the background field
 * stable across renders and keeps useMemo pure for the lint rule.
 */
function mulberry32(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * H-2 fix: bumped from 3200 to 12000 and tightened the shell from
 * radius=5..18 to radius=5..11 — previously most points were in the
 * outer shell, far from camera, fading to invisible on 4K. Ecliptic
 * flattening preserved (phi factor 0.55) because real NEOs cluster
 * near the ecliptic.
 */
function buildBackgroundNEOGeometry(): THREE.BufferGeometry {
  const rng = mulberry32(0xC70E);
  const count = 12000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const u = rng();
    const v = rng();
    const theta = 2 * Math.PI * u;
    const phi_raw = Math.acos(2 * v - 1);
    const phi = Math.PI / 2 + (phi_raw - Math.PI / 2) * 0.55;
    const radius = 5 + rng() * 6;

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    if (rng() < 0.08) {
      colors[i * 3] = 0.85;
      colors[i * 3 + 1] = 0.7;
      colors[i * 3 + 2] = 0.5;
    } else {
      colors[i * 3] = 0.45 + rng() * 0.2;
      colors[i * 3 + 1] = 0.55 + rng() * 0.2;
      colors[i * 3 + 2] = 0.8 + rng() * 0.2;
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geom;
}

const BACKGROUND_NEO_GEOMETRY = buildBackgroundNEOGeometry();

/**
 * Background NEO field. raycast is intentionally disabled — these are
 * decorative catalog context, not interactive. The smaller size + lower
 * opacity signals "not a click target" so users don't try to click them
 * (reinforcement of U-3 intent).
 *
 * Wraps the <points> in a group that drifts very slowly — gives the sky
 * a "slightly alive" feel without being distracting (U-4 polish).
 */
function BackgroundNEOField() {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.0045;
  });
  return (
    <group ref={groupRef}>
      <points geometry={BACKGROUND_NEO_GEOMETRY} raycast={() => null}>
        <pointsMaterial
          vertexColors
          size={0.028}
          sizeAttenuation
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

interface MarkerProps {
  candidate: RankedCandidate;
  selected: boolean;
  onClick: () => void;
}

interface TorinoHazardStyle {
  color: string;
  emissiveIntensity: number;
  pulseHz: number;
  pulseAmp: number;
  baseSize: number;
}

function torinoHazardStyle(scale: number): TorinoHazardStyle {
  if (scale >= 6) {
    return {
      color: "#991b1b",
      emissiveIntensity: 1.6,
      pulseHz: 2.0,
      pulseAmp: 0.35,
      baseSize: 0.09,
    };
  }
  if (scale >= 4) {
    return {
      color: "#ef4444",
      emissiveIntensity: 1.25,
      pulseHz: 1.4,
      pulseAmp: 0.28,
      baseSize: 0.08,
    };
  }
  if (scale === 3) {
    return {
      color: "#f97316",
      emissiveIntensity: 0.95,
      pulseHz: 1.0,
      pulseAmp: 0.2,
      baseSize: 0.07,
    };
  }
  if (scale === 2) {
    return {
      color: "#eab308",
      emissiveIntensity: 0.65,
      pulseHz: 0.5,
      pulseAmp: 0.12,
      baseSize: 0.06,
    };
  }
  if (scale === 1) {
    return {
      color: "#3b82f6",
      emissiveIntensity: 0.45,
      pulseHz: 0,
      pulseAmp: 0,
      baseSize: 0.055,
    };
  }
  // Torino 0 — routine. Still visible at wide zoom (bump in size +
  // emissive after F-4 reports confirmed T0 markers were hard to spot
  // when the camera was zoomed out beyond ~5 AU).
  return {
    color: "#94a3b8",
    emissiveIntensity: 0.5,
    pulseHz: 0,
    pulseAmp: 0,
    baseSize: 0.055,
  };
}

/**
 * F-1 primary-candidate 24 h motion arc.
 *
 * Renders:
 *   - A great-circle centerline sampled hourly from the tracklet position
 *     along its proper-motion direction.
 *   - Tick marks (small radial stubs) at +6 h / +12 h / +18 h / +24 h.
 *   - A translucent uncertainty wedge whose half-angle shrinks with
 *     longer observed arcs.
 *
 * Honest framing: arc direction comes from hashTrksub(trksub) when the
 * upstream feed doesn't supply a position angle. The wedge encodes that
 * direction uncertainty visually — a fresh <15 min tracklet will show a
 * wide fan; a 3-hour arc shows a narrow ribbon. Caller UI states this
 * explicitly in CandidateDetailsPanel.
 */
function PrimaryMotionArc({
  candidate,
  color,
}: {
  candidate: RankedCandidate;
  color: number;
}) {
  const envelope = useMemo(
    () =>
      computeMotionEnvelope({
        ra_deg: candidate.ra_deg,
        dec_deg: candidate.dec_deg,
        rate_arcsec_min: candidate.rate_arcsec_min ?? 0.5,
        arc_length_minutes: candidate.arc_length_minutes ?? 5,
        trksub_hash: hashTrksub(candidate.trksub),
      }),
    [candidate],
  );

  const coneSamples = useMemo(
    () => computeUncertaintyCone(
      {
        ra_deg: candidate.ra_deg,
        dec_deg: candidate.dec_deg,
        rate_arcsec_min: candidate.rate_arcsec_min ?? 0.5,
        arc_length_minutes: candidate.arc_length_minutes ?? 5,
      },
      envelope,
      18,
    ),
    [candidate, envelope],
  );

  // Place all geometry slightly outside the sphere so we never z-fight
  // with the Earth or grid.
  const R = SPHERE_RADIUS * 1.015;

  const centerlineGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(envelope.arc.length * 3);
    envelope.arc.forEach((s, i) => {
      const p = radec_to_xyz(s.ra_deg, s.dec_deg, R);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [envelope, R]);

  const coneGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(coneSamples.length * 3);
    coneSamples.forEach((s, i) => {
      const p = radec_to_xyz(s.ra_deg, s.dec_deg, R * 0.998);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [coneSamples, R]);

  const centerMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
      }),
    [color],
  );
  const coneMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
      }),
    [color],
  );

  const centerLine = useMemo(
    () => new THREE.Line(centerlineGeom, centerMat),
    [centerlineGeom, centerMat],
  );
  const coneLine = useMemo(
    () => new THREE.LineLoop(coneGeom, coneMat),
    [coneGeom, coneMat],
  );

  // Fade-in on mount: 300 ms ease-out. Three.js material props are the
  // runtime animation target — mutation is the idiomatic R3F path.
  const fadeT = useRef(0);
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    if (fadeT.current >= 1) return;
    fadeT.current = Math.min(1, fadeT.current + delta / 0.3);
    const eased = 1 - Math.pow(1 - fadeT.current, 3);
    centerMat.opacity = 0.95 * eased;
    coneMat.opacity = 0.25 * eased;
  });
  /* eslint-enable react-hooks/immutability */

  useEffect(() => {
    return () => {
      centerlineGeom.dispose();
      coneGeom.dispose();
      centerMat.dispose();
      coneMat.dispose();
    };
  }, [centerlineGeom, coneGeom, centerMat, coneMat]);

  // Tick mark points at +6, +12, +18, +24 h
  const tickPoints = useMemo(() => {
    const ticks = [6, 12, 18, 24];
    return ticks
      .map((t) => envelope.arc.find((s) => Math.abs(s.t_hours - t) < 0.01))
      .filter(Boolean) as typeof envelope.arc;
  }, [envelope]);

  return (
    <group>
      <primitive object={coneLine} />
      <primitive object={centerLine} />
      {tickPoints.map((s) => {
        const p = radec_to_xyz(s.ra_deg, s.dec_deg, R);
        return (
          <mesh key={`tick-${s.t_hours}`} position={[p.x, p.y, p.z]}>
            <sphereGeometry args={[0.018, 12, 12]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * U-1 perception fix: when a new candidate arrives via the WebSocket
 * agent feed, the marker used to just pop in at full scale — no signal
 * to the user that anything changed. Now: scale animates 0→1 over 900ms
 * with ease-out, and the emissive pulses for an additional 2.5s so the
 * viewer's eye catches the new object even on the back of a slowly
 * rotating sphere.
 */
function useEnterAnimation() {
  const mountTime = useRef(0);
  useEffect(() => {
    mountTime.current = performance.now();
  }, []);
  return mountTime;
}

/**
 * Halo ring on top of the candidate marker that signals the Opus 4.7
 * expert reviewer's verdict at a glance.
 *  - CONCUR        → very subtle emerald ring (static, low opacity) —
 *                    "ranker is right, no action needed", barely visible.
 *  - PARTIAL_CONCUR→ static amber ring at moderate opacity.
 *  - DISSENT       → pulsing purple ring (1 Hz sin oscillation 0.6→1.0)
 *                    + thicker tube so the eye is drawn to where the
 *                    expert and the ranker disagree — that's where
 *                    operator attention is most needed.
 */
function ExpertReviewGlow({
  endorsement,
  radius,
}: {
  endorsement: "CONCUR" | "PARTIAL_CONCUR" | "DISSENT";
  radius: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const colorHex =
    endorsement === "DISSENT"
      ? "#a855f7"
      : endorsement === "PARTIAL_CONCUR"
        ? "#fbbf24"
        : "#10b981";
  // Tube thickness scales with how much the operator should care about
  // this ring — DISSENT thickest, CONCUR almost a hairline.
  const tubeRadius =
    endorsement === "DISSENT"
      ? radius * 0.07
      : endorsement === "PARTIAL_CONCUR"
        ? radius * 0.045
        : radius * 0.025;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    if (endorsement === "DISSENT") {
      const t = clock.elapsedTime * 2 * Math.PI; // 1 Hz
      material.opacity = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t));
    } else if (endorsement === "PARTIAL_CONCUR") {
      material.opacity = 0.32;
    } else {
      material.opacity = 0.16;
    }
  });

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[radius, tubeRadius, 8, 32]} />
      <meshBasicMaterial
        color={colorHex}
        transparent
        opacity={0.3}
        depthWrite={false}
      />
    </mesh>
  );
}

function CandidateMarker({ candidate, selected, onClick }: MarkerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const mountTime = useEnterAnimation();

  const position = useMemo(() => {
    const p = radec_to_xyz(candidate.ra_deg, candidate.dec_deg, SPHERE_RADIUS);
    return new THREE.Vector3(p.x, p.y, p.z);
  }, [candidate.ra_deg, candidate.dec_deg]);

  const torino = computeTorinoFromCandidate(
    candidate.impact_probability,
    candidate.absolute_magnitude_h,
  );
  const isHero = candidate.trksub === "P21YR4A";

  // F-6: Torino-scale visual hierarchy. Colour, emissive intensity, pulse
  // rate, and base size all scale with hazard level so the eye is drawn
  // to T3+ objects first and T0 routine candidates recede into the
  // background. Table comes from internal design review — see
  // docs/verification/sky-view-forensic-analysis.md §F-6.
  const hazard = torinoHazardStyle(torino.scale);
  const color = hazard.color;

  const baseSize = isHero ? 0.09 : hazard.baseSize;
  const size = selected || hovered ? baseSize * 1.45 : baseSize;

  useFrame(({ clock, camera }) => {
    if (!meshRef.current) return;

    // Enter animation: first 900ms, scale grows from 0 → 1 with ease-out.
    const elapsed = performance.now() - mountTime.current;
    const enterProgress = Math.min(1, elapsed / 900);
    const enterScale = 1 - Math.pow(1 - enterProgress, 3); // ease-out cubic
    const pulseBoost = elapsed < 3500 && !isHero
      ? 1 + Math.sin(elapsed * 0.008) * 0.35 * (1 - elapsed / 3500)
      : 1;

    // Torino-driven pulse. Hero (YR4 analog) keeps its dramatic 2.5 Hz
    // beat. Others pulse at hazard.pulseHz · 2π rad/s, or not at all.
    const hazardPulse =
      hazard.pulseHz > 0
        ? 1 + Math.sin(clock.elapsedTime * hazard.pulseHz * 2 * Math.PI) *
          hazard.pulseAmp
        : 1;

    // F-5: compensate for camera distance so markers don't collapse
    // to invisible at max zoom-out (16 AU) or swell to cover the scene
    // at min zoom-in (2.2 AU). Normalised to the default camera distance
    // (6.5 world units) and clamped so the compensation itself can't go
    // extreme.
    const camDist = camera.position.length();
    const DEFAULT_CAM_DIST = 6.5;
    const distScale = Math.max(
      0.55,
      Math.min(1.9, camDist / DEFAULT_CAM_DIST),
    );

    if (isHero) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.5) * 0.22;
      meshRef.current.scale.setScalar(pulse * enterScale * distScale);
    } else if (selected) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.14;
      meshRef.current.scale.setScalar(pulse * enterScale * distScale);
    } else {
      meshRef.current.scale.setScalar(
        enterScale * pulseBoost * hazardPulse * distScale,
      );
    }
  });

  const showLabel = isHero || selected || hovered || torino.scale >= 3;

  return (
    <>
      {selected && (
        <PrimaryMotionArc
          key={`arc-${candidate.trksub}`}
          candidate={candidate}
          color={new THREE.Color(color).getHex()}
        />
      )}
      <group position={[position.x, position.y, position.z]}>
        <mesh
          ref={meshRef}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHovered(false);
            document.body.style.cursor = "auto";
          }}
        >
          <sphereGeometry args={[size, 24, 24]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={
              selected || isHero
                ? Math.max(1.6, hazard.emissiveIntensity + 0.5)
                : hovered
                  ? hazard.emissiveIntensity + 0.3
                  : hazard.emissiveIntensity
            }
          />
        </mesh>
        {(isHero || selected) && (
          <mesh>
            <sphereGeometry args={[size * 1.9, 24, 24]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={selected ? 0.25 : 0.15}
              depthWrite={false}
            />
          </mesh>
        )}
        {candidate.expert_review && (
          <ExpertReviewGlow
            endorsement={candidate.expert_review.class_endorsement}
            radius={size * 2.6}
          />
        )}
        {showLabel && (
          <Html
            center
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                color: "#e5e7eb",
                background: "rgba(10,10,15,0.72)",
                padding: "2px 6px",
                borderRadius: 3,
                border: "1px solid rgba(255,255,255,0.1)",
                whiteSpace: "nowrap",
                // Offset in screen pixels so the label sits to the right
                // of the marker at any camera distance. Kept constant
                // because Html without distanceFactor is already rendered
                // in screen space.
                transform: "translate(14px, -50%)",
              }}
            >
              <div style={{ color }}>{candidate.trksub}</div>
              {(selected || hovered) && (
                <div style={{ color: "#9ca3af", fontSize: 10, marginTop: 2 }}>
                  P(NEO) {candidate.prediction.prob_neo.toFixed(2)} ·{" "}
                  {torino.label} · V {candidate.mean_magnitude_v.toFixed(1)}
                </div>
              )}
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

/**
 * H-4 fix: ecliptic and celestial equator were barely visible over the
 * near-black scene background. Bumped opacity 0.30→0.55 / 0.35→0.50,
 * colours brightened, and added inline labels so viewers can read the
 * geometry instead of just seeing "a random line".
 */
function CelestialGrid() {
  const points_equator: [number, number, number][] = [];
  const points_ecliptic: [number, number, number][] = [];
  const segments = 128;
  const tilt = (23.44 * Math.PI) / 180;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = SPHERE_RADIUS * Math.cos(theta);
    const z = -SPHERE_RADIUS * Math.sin(theta);
    points_equator.push([x, 0, z]);
    const y_ecl = SPHERE_RADIUS * Math.sin(theta) * Math.sin(tilt);
    const z_ecl = -SPHERE_RADIUS * Math.sin(theta) * Math.cos(tilt);
    points_ecliptic.push([x, y_ecl, z_ecl]);
  }

  const equatorGeom = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints(
        points_equator.map((p) => new THREE.Vector3(...p)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const eclipticGeom = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints(
        points_ecliptic.map((p) => new THREE.Vector3(...p)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const equatorLine = useMemo(
    () =>
      new THREE.Line(
        equatorGeom,
        new THREE.LineBasicMaterial({
          color: 0x64748b,
          transparent: true,
          opacity: 0.5,
        }),
      ),
    [equatorGeom],
  );
  const eclipticLine = useMemo(
    () =>
      new THREE.Line(
        eclipticGeom,
        new THREE.LineBasicMaterial({
          color: 0x8b5cf6,
          transparent: true,
          opacity: 0.55,
        }),
      ),
    [eclipticGeom],
  );

  return (
    <>
      <primitive object={equatorLine} />
      <primitive object={eclipticLine} />
      {/* Labels at extreme edges */}
      <Html
        position={[SPHERE_RADIUS, 0, 0]}
        center
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 9,
            color: "#94a3b8",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            opacity: 0.85,
            whiteSpace: "nowrap",
          }}
        >
          celestial equator
        </div>
      </Html>
      <Html
        position={[
          SPHERE_RADIUS * Math.cos(Math.PI / 2),
          SPHERE_RADIUS * Math.sin(Math.PI / 2) * Math.sin(tilt),
          -SPHERE_RADIUS * Math.sin(Math.PI / 2) * Math.cos(tilt),
        ]}
        center
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 9,
            color: "#a78bfa",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            opacity: 0.85,
            whiteSpace: "nowrap",
          }}
        >
          ecliptic
        </div>
      </Html>
    </>
  );
}

function Sun() {
  return (
    <directionalLight
      position={[12, 4, 8]}
      intensity={1.4}
      color="#fff4e0"
      castShadow={false}
    />
  );
}

/**
 * Option C: compute each famous NEO's CURRENT apparent sky position
 * from its Keplerian elements (via kepler.ts) + sample its 1-year
 * ground track for rendering as a curve on the celestial sphere.
 *
 * Expensive-ish (18 × 64 Kepler solves) but done exactly once per
 * mount — the JD is locked at mount time to keep the scene
 * deterministic during a demo recording.
 */
interface ComputedFamousNEO {
  neo: FamousNEO;
  ra_deg: number;
  dec_deg: number;
  track: Array<{ ra_deg: number; dec_deg: number }>;
}

function useComputedFamousNEOs(): ComputedFamousNEO[] {
  return useMemo(() => {
    const jd = currentJD();
    const earth = earthHeliocentricAtJD(jd);
    return FAMOUS_NEOS.map((neo) => {
      const helio = heliocentricPositionAtJD(
        neo.orbit,
        jd,
        neo.orbital_epoch_jd,
      );
      const { ra_deg, dec_deg } = heliocentricToGeocentricCelestialSphere(
        helio,
        earth,
      );
      const track = orbitGroundTrack(
        neo.orbit,
        64,
        jd,
        undefined,
        neo.orbital_epoch_jd,
      );
      return { neo, ra_deg, dec_deg, track };
    });
  }, []);
}

function FamousNEOField({
  onFamousNEOClick,
  selectedDesignation,
}: {
  onFamousNEOClick?: (designation: string) => void;
  selectedDesignation?: string | null;
}) {
  const computed = useComputedFamousNEOs();
  // F-2: progressive reveal. Ground track renders only for the selected
  // object. Key includes designation so React remounts (and therefore
  // replays the mount fade-in) whenever the selection changes.
  const selected = computed.find(
    (c) => c.neo.designation === selectedDesignation,
  );
  return (
    <>
      {selected && (
        <OrbitGroundTrack
          key={`track-${selected.neo.designation}`}
          neo={selected.neo}
          track={selected.track}
        />
      )}
      {computed.map((c) => (
        <FamousNEOMarker
          key={`${c.neo.designation}-${c.neo.name}`}
          neo={c.neo}
          ra_deg={c.ra_deg}
          dec_deg={c.dec_deg}
          selected={c.neo.designation === selectedDesignation}
          onClick={
            onFamousNEOClick
              ? () => onFamousNEOClick(c.neo.designation)
              : undefined
          }
        />
      ))}
    </>
  );
}

function orbitClassColor(orbit_class: FamousNEO["orbit_class"]): string {
  switch (orbit_class) {
    case "Apollo":
      return "#f87171";
    case "Aten":
      return "#fb923c";
    case "Amor":
      return "#fbbf24";
    case "Atira":
      return "#a78bfa";
    case "Comet":
      return "#60a5fa";
    case "MBA":
      return "#64748b";
  }
}

const ORBIT_FADE_TARGET_OPACITY = 0.88;
const ORBIT_FADE_DURATION_SECONDS = 0.3;

function OrbitGroundTrack({
  neo,
  track,
}: {
  neo: FamousNEO;
  track: Array<{ ra_deg: number; dec_deg: number }>;
}) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(track.length * 3);
    // Slightly inside the marker sphere so lines don't z-fight with
    // textures or the Earth.
    const R = SPHERE_RADIUS * 0.985;
    for (let i = 0; i < track.length; i++) {
      const p = radec_to_xyz(track[i].ra_deg, track[i].dec_deg, R);
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [track]);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: orbitClassColor(neo.orbit_class),
        transparent: true,
        opacity: 0,
      }),
    [neo.orbit_class],
  );

  const line = useMemo(() => new THREE.Line(geom, material), [geom, material]);

  // Fade-in on mount: ease-out opacity 0 → ORBIT_FADE_TARGET_OPACITY over
  // ORBIT_FADE_DURATION_SECONDS. Remount (keyed by designation) replays
  // this whenever the user clicks a different object.
  const fadeT = useRef(0);
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    if (fadeT.current >= 1) return;
    fadeT.current = Math.min(
      1,
      fadeT.current + delta / ORBIT_FADE_DURATION_SECONDS,
    );
    // ease-out cubic
    const eased = 1 - Math.pow(1 - fadeT.current, 3);
    material.opacity = ORBIT_FADE_TARGET_OPACITY * eased;
  });
  /* eslint-enable react-hooks/immutability */

  useEffect(() => {
    return () => {
      geom.dispose();
      material.dispose();
    };
  }, [geom, material]);

  return <primitive object={line} />;
}

/**
 * U-3 / U-4 / B-2 fix. Previously: raycast={() => null} disabled
 * interaction AND silently made the onPointerOver handlers dead code
 * (B-2). Now: raycast is enabled (default), onClick opens the
 * FamousNEODetailsPanel, hover works. Marker radius 0.022→0.040 with
 * subtle glow for visual hierarchy, so these feel like known objects
 * rather than background pixels. Non-NEO main-belt bodies get a
 * dimmer treatment so they don't compete with Apollos/Atens.
 */
function FamousNEOMarker({
  neo,
  ra_deg,
  dec_deg,
  selected,
  onClick,
}: {
  neo: FamousNEO;
  ra_deg: number;
  dec_deg: number;
  selected: boolean;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const pos = useMemo(
    () => radec_to_xyz(ra_deg, dec_deg, SPHERE_RADIUS * 1.02),
    [ra_deg, dec_deg],
  );
  const baseColor =
    neo.orbit_class === "Apollo" || neo.orbit_class === "Aten"
      ? "#cbd5e1"
      : neo.orbit_class === "Amor"
        ? "#a5b4fc"
        : neo.orbit_class === "Comet"
          ? "#a78bfa"
          : "#64748b"; // MBA — dimmer

  const sizeBase = neo.is_neo ? 0.04 : 0.028;
  const size = selected || hovered ? sizeBase * 1.6 : sizeBase;
  const glowIntensity = selected ? 1.4 : hovered ? 0.9 : 0.35;

  return (
    <group position={[pos.x, pos.y, pos.z]}>
      <mesh
        onPointerOver={(e) => {
          if (!onClick) return;
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          if (!onClick) return;
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
        onClick={
          onClick
            ? (e) => {
                e.stopPropagation();
                onClick();
              }
            : undefined
        }
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={baseColor}
          emissiveIntensity={glowIntensity}
          transparent
          opacity={neo.is_neo ? 0.95 : 0.7}
        />
      </mesh>
      {(selected || hovered) && (
        <mesh>
          <sphereGeometry args={[size * 2.1, 16, 16]} />
          <meshBasicMaterial
            color={baseColor}
            transparent
            opacity={selected ? 0.3 : 0.18}
            depthWrite={false}
          />
        </mesh>
      )}
      <Html
        center
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 10,
            color: hovered || selected ? "#f1f5f9" : "#cbd5e1",
            whiteSpace: "nowrap",
            transform: "translate(12px, -50%)",
            opacity: selected || hovered ? 1 : 0.82,
            letterSpacing: 0.3,
            textShadow: "0 0 6px rgba(0,0,0,0.85)",
          }}
        >
          {neo.name}
          {!neo.is_neo && (
            <span
              style={{
                marginLeft: 4,
                fontSize: 8,
                color: "#64748b",
              }}
            >
              · MBA
            </span>
          )}
        </div>
      </Html>
    </group>
  );
}

export function SkyViewPanel({
  candidates,
  selectedTrksub,
  onCandidateClick,
  onFamousNEOClick,
  selectedFamousNEODesignation,
  onDeselect,
  showContext = true,
}: Props) {
  // F-4: defensive filter so a candidate with missing/NaN coords can't
  // silently disappear from Sky View while still counting in Live Feed.
  // We keep the entry in the list but log it in dev so the gap is
  // auditable. When `showContext === false` (Triage Focus mode), we
  // additionally hide rows that the operator does not need to act on
  // tonight: low-P(NEO) routine artefacts unless Opus has explicitly
  // flagged them with a follow_up / second-epoch action.
  const renderableCandidates = useMemo(() => {
    const good: RankedCandidate[] = [];
    const bad: Array<{ trksub: string; ra: unknown; dec: unknown }> = [];
    for (const c of candidates) {
      if (
        typeof c.ra_deg === "number" &&
        Number.isFinite(c.ra_deg) &&
        typeof c.dec_deg === "number" &&
        Number.isFinite(c.dec_deg)
      ) {
        good.push(c);
      } else {
        bad.push({ trksub: c.trksub, ra: c.ra_deg, dec: c.dec_deg });
      }
    }
    if (import.meta.env.DEV) {
      console.debug(
        "[SkyView] candidate sync",
        {
          received: candidates.length,
          rendered: good.length,
          skipped_bad_coords: bad,
        },
      );
    }
    if (showContext) return good;
    // Triage Focus: keep only candidates that genuinely need a decision
    // tonight. P(NEO) >= 0.5 covers the high-confidence pool; the
    // Opus-flagged actions cover edge cases where the ranker is unsure
    // but the expert reviewer thinks the operator should look.
    const ACTION_FOCUS = new Set([
      "follow_up_immediately",
      "request_second_epoch",
    ]);
    return good.filter((c) => {
      if (c.prediction.prob_neo >= 0.5) return true;
      const action = c.expert_review?.suggested_action;
      return action != null && ACTION_FOCUS.has(action);
    });
  }, [candidates, showContext]);
  return (
    <Canvas
      camera={{ position: [0, 1.4, 6.5], fov: 50 }}
      style={{ background: "#02040a" }}
      dpr={[1, 2]}
      onPointerMissed={() => onDeselect?.()}
    >
      <ambientLight intensity={0.18} />
      <Sun />
      <pointLight position={[-10, -4, -6]} intensity={0.22} color="#4488ff" />

      <Suspense fallback={null}>
        <Stars
          radius={90}
          depth={50}
          count={7000}
          factor={3}
          saturation={0}
          fade
          speed={0.4}
        />
        {showContext && <BackgroundNEOField />}
        <Earth />
        <CelestialGrid />
        {showContext && (
          <FamousNEOField
            onFamousNEOClick={onFamousNEOClick}
            selectedDesignation={selectedFamousNEODesignation}
          />
        )}
        {renderableCandidates.map((c) => (
          <CandidateMarker
            key={c.trksub}
            candidate={c}
            selected={c.trksub === selectedTrksub}
            onClick={() => onCandidateClick(c.trksub)}
          />
        ))}
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={2.2}
        maxDistance={16}
        autoRotate
        autoRotateSpeed={0.35}
      />
    </Canvas>
  );
}
