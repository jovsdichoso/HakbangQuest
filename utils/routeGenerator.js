// utils/routeGenerator.js

// === CONFIG ===
const ORS_API_KEY =
  "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImQzZTVmYTMwODYyNTQ0NTc4YTM2ZDFiNTEzMWEzMDA2IiwiaCI6Im11cm11cjY0In0=";

// === MAIN FUNCTION ===
export const generateRoute = async (startLocation, targetDistance, activityType) => {
  if (!startLocation) {
    console.error("No start location provided");
    return null;
  }

  const { latitude, longitude } = startLocation;

  // Map activityType to ORS profile
  const modeMap = {
    walking: "foot-walking",
    hiking: "foot-hiking",
    cycling: "cycling-regular",
    biking: "cycling-regular",
    running: "foot-walking",
  };
  const profile = modeMap[activityType] || "foot-walking";

  if (!ORS_API_KEY || ORS_API_KEY === "YOUR_HEIGIT_API_KEY") {
    console.warn("⚠️ No ORS API key set, using mock route generator.");
    return generateMockRoute(startLocation, targetDistance, activityType);
  }

  const url = `https://api.openrouteservice.org/v2/directions/${profile}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: ORS_API_KEY,
  };

  const body = {
    coordinates: [
      [longitude, latitude],
      [longitude + 0.01, latitude + 0.01], // simple offset destination for demo
    ],
    geometry_format: "geojson", // ✅ correct parameter
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.routes?.length) {
      console.error("No route returned:", data);
      return null;
    }

    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    }));

    const routeDistance = route.summary.distance / 1000; // km
    const difficulty =
      routeDistance <= 5 ? "easy" : routeDistance <= 10 ? "moderate" : "hard";

    return {
      id: `generated-${Date.now()}`,
      name: `${activityType} Route`,
      coordinates: coords,
      waypoints: [
        { ...coords[0], name: "Start", type: "start" },
        { ...coords[Math.floor(coords.length / 2)], name: "Midpoint", type: "waypoint" },
        { ...coords[coords.length - 1], name: "Finish", type: "end" },
      ],
      distance: Number.parseFloat(routeDistance.toFixed(2)),
      difficulty,
      description: `A ${difficulty} ${routeDistance.toFixed(2)} km route for ${activityType}`,
      routeType: "one-way",
    };
  } catch (err) {
    console.error("ORS error:", err);
    return generateMockRoute(startLocation, targetDistance, activityType);
  }
};

// === MOCK GENERATOR (Fallback) ===
const generateMockRoute = (startLocation, targetDistance, activityType) => {
  const { latitude, longitude } = startLocation;
  const kmToDegrees = 1 / 111.139;
  const radius = (targetDistance / 2) * kmToDegrees;

  const coordinates = [
    { latitude, longitude },
    { latitude: latitude + radius, longitude },
    { latitude: latitude + radius, longitude: longitude + radius },
    { latitude, longitude: longitude + radius },
    { latitude, longitude },
  ];

  return {
    id: `mock-${Date.now()}`,
    name: `${activityType} Mock Route`,
    coordinates,
    waypoints: [
      { ...coordinates[0], name: "Start", type: "start" },
      { ...coordinates[Math.floor(coordinates.length / 2)], name: "Midpoint", type: "waypoint" },
      { ...coordinates[coordinates.length - 1], name: "Finish", type: "end" },
    ],
    distance: targetDistance,
    difficulty:
      targetDistance <= 5 ? "easy" : targetDistance <= 10 ? "moderate" : "hard",
    description: `Mock ${targetDistance} km ${activityType} route`,
    routeType: "loop",
  };
};
