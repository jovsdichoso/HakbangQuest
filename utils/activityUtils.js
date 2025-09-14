// Enhanced utility functions for activity calculations

// Calculate distance between two coordinates using the Haversine formula
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  // Validate inputs
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null ||
    lat1 < -90 ||
    lat1 > 90 ||
    lat2 < -90 ||
    lat2 > 90 ||
    lon1 < -180 ||
    lon1 > 180 ||
    lon2 < -180 ||
    lon2 > 180
  ) {
    console.warn("Invalid coordinates provided to calculateDistance")
    return 0
  }

  // If the coordinates are identical, return 0
  if (lat1 === lat2 && lon1 === lon2) {
    return 0
  }

  // Haversine formula to calculate distance between two coordinates
  const R = 6371e3 // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return Number.parseFloat((R * c).toFixed(2))
}

// Calculate pace in minutes per kilometer
export const calculatePace = (distance, duration) => {
  // Ensure we're working with valid numbers and prevent division by zero
  if (!distance || !duration || distance <= 0 || duration <= 0) return 0

  // Calculate minutes per kilometer
  // Convert distance from meters to kilometers first
  const distanceInKm = distance / 1000

  // Calculate pace (minutes per km)
  const pace = duration / 60 / distanceInKm

  // Log for debugging
  console.log(`Pace calculation: ${duration}s / ${distanceInKm.toFixed(4)}km = ${pace.toFixed(2)} min/km`)

  return pace
}


// Format time in minutes:seconds
export const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds === null || seconds === undefined || seconds === 0) return "0:00"

  const mins = Math.floor(Number(seconds) / 60)
  const secs = Math.floor(Number(seconds) % 60)
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`
}

// Format pace in minutes:seconds per km
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
