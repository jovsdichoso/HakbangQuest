// Enhanced utility functions for activity calculations

// Calculate distance between two coordinates using the Haversine formula
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  if (
    lat1 == null || lon1 == null || lat2 == null || lon2 == null ||
    lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90 ||
    lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180
  ) {
    console.warn("Invalid coordinates provided to calculateDistance");
    return 0;
  }
  if (lat1 === lat2 && lon1 === lon2) {
    return 0;
  }
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number.parseFloat((R * c).toFixed(2));
};[2]

// Calculate pace in minutes per kilometer
export const calculatePace = (distance, duration) => {
  if (!distance || !duration || distance <= 0 || duration <= 0) return 0;
  const distanceInKm = distance / 1000;
  const pace = (duration / 60) / distanceInKm; // min per km
  return pace;
};[2]

// Format distance from meters to km with appropriate precision
export const formatDistance = (meters) => {
  if (isNaN(meters) || meters === null || meters === undefined || meters === 0) return "0.00 km"

  const km = Number(meters) / 1000
  return `${km.toFixed(2)} km`
}

// Format duration from seconds to HH:MM:SS or MM:SS
export const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds === null || seconds === undefined || seconds === 0) return "0:00"

  const totalSeconds = Math.floor(Number(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`
}

// Format pace in minutes:seconds per km
export const formatPacePerKm = (paceInMinutesPerKm) => {
  if (
    isNaN(paceInMinutesPerKm) ||
    paceInMinutesPerKm === null ||
    paceInMinutesPerKm === undefined ||
    paceInMinutesPerKm === 0 ||
    !isFinite(paceInMinutesPerKm)
  )
    return "0:00/km"

  const mins = Math.floor(paceInMinutesPerKm)
  const secs = Math.floor((paceInMinutesPerKm - mins) * 60)
  return `${mins}:${secs < 10 ? "0" : ""}${secs}/km`
}

// Format speed in km/h
export const formatSpeedKmh = (speedKmh) => {
  if (isNaN(speedKmh) || speedKmh === null || speedKmh === undefined || speedKmh === 0) return "0.0 km/h"

  return `${Number(speedKmh).toFixed(1)} km/h`
}

// Helper to unify legacy data that might have mixed units
export const unifyUnits = (value, unit = "meters") => {
  if (isNaN(value) || value === null || value === undefined) return 0

  const numValue = Number(value)

  // If unit is already meters or seconds, return as-is
  if (unit === "meters" || unit === "seconds") {
    return numValue
  }

  // Convert km to meters if needed
  if (unit === "km") {
    return numValue * 1000
  }

  // Convert minutes to seconds if needed
  if (unit === "minutes") {
    return numValue * 60
  }

  return numValue
}

// Legacy formatTime function (kept for backward compatibility)
export const formatTime = (seconds) => {
  return formatDuration(seconds)
}

// Legacy formatPace function (kept for backward compatibility)
export const formatPace = (paceInMinutesPerKm) => {
  if (
    isNaN(paceInMinutesPerKm) ||
    paceInMinutesPerKm === null ||
    paceInMinutesPerKm === undefined ||
    paceInMinutesPerKm === 0 ||
    !isFinite(paceInMinutesPerKm)
  )
    return "0:00"

  const mins = Math.floor(paceInMinutesPerKm)
  const secs = Math.floor((paceInMinutesPerKm - mins) * 60)
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`
}

export const calculateMetrics = (distance, duration) => {
  const numDistance = Number(distance)
  const numDuration = Number(duration)
  if (numDistance <= 0 || numDuration <= 0 || isNaN(numDistance) || isNaN(numDuration)) {
    return { pace: 0, avgSpeed: 0 }
  }
  const pace = calculatePace(numDistance, numDuration)
  const avgSpeed = numDistance / 1000 / (numDuration / 3600)
  return { pace, avgSpeed }
}

// Ensure a value is numeric, with a default fallback
export const ensureNumeric = (value, defaultValue = 0) => {
  const num = Number(value)
  return isNaN(num) ? defaultValue : num
}
