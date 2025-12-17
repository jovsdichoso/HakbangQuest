export const getActivityDisplayInfo = (activity) => {
  if (!activity) return null

  // Normalize activity type ID
  const normalizedTypeId = normalizeActivityTypeId(activity.activityType || activity.type)

  // Activity type configurations
  const ACTIVITY_CONFIGS = {
    walking: {
      icon: "walk-outline",
      color: "#4361EE",
      isGpsActivity: true,
      displayFields: ["distance", "duration", "pace"],
    },
    running: {
      icon: "walk-outline",
      color: "#FF6B6B",
      isGpsActivity: true,
      displayFields: ["distance", "duration", "pace"],
    },
    jogging: {
      icon: "walk-outline",
      color: "#FFC107",
      isGpsActivity: true,
      displayFields: ["distance", "duration", "pace"],
    },
    cycling: {
      icon: "bicycle-outline",
      color: "#06D6A0",
      isGpsActivity: true,
      displayFields: ["distance", "duration", "speed"],
    },
    pushup: {
      icon: "fitness-outline",
      color: "#9B5DE5",
      isGpsActivity: false,
      displayFields: ["reps", "sets", "duration"],
    },
    pullup: {
      icon: "fitness-outline",
      color: "#8B5CF6",
      isGpsActivity: false,
      displayFields: ["reps", "sets", "duration"],
    },
    squat: {
      icon: "fitness-outline",
      color: "#F59E0B",
      isGpsActivity: false,
      displayFields: ["reps", "sets", "duration"],
    },
    plank: {
      icon: "fitness-outline",
      color: "#EF4444",
      isGpsActivity: false,
      displayFields: ["duration", "sets"],
    },
    situp: {
      icon: "fitness-outline",
      color: "#10B981",
      isGpsActivity: false,
      displayFields: ["reps", "sets", "duration"],
    },
  }

  const config = ACTIVITY_CONFIGS[normalizedTypeId] || ACTIVITY_CONFIGS.walking

  return {
    ...config,
    activityType: normalizedTypeId,
    displayName: capitalizeFirst(normalizedTypeId),
    values: getActivityValues(activity, config.displayFields),
  }
}

// Helper to normalize activity type IDs
const normalizeActivityTypeId = (value) => {
  if (!value) return "walking"

  const normalized = value.toLowerCase().trim()

  // Handle common variations
  const typeMap = {
    "push-ups": "pushup",
    "push ups": "pushup",
    pushups: "pushup",
    "pull-ups": "pullup",
    "pull ups": "pullup",
    pullups: "pullup",
    "sit-ups": "situp",
    "sit ups": "situp",
    situps: "situp",
  }

  return typeMap[normalized] || normalized
}

// Helper to capitalize first letter
const capitalizeFirst = (str) => {
  if (!str) return ""
  return str.charAt(0).toUpperCase() + str.slice(1)
}

// Helper to extract activity values based on display fields
const getActivityValues = (activity, displayFields) => {
  const values = {}

  displayFields.forEach((field) => {
    switch (field) {
      case "distance":
        values.distance =
          typeof activity.distance === "number" && !isNaN(activity.distance) ? activity.distance.toFixed(2) : "0"
        break
      case "duration":
        values.duration = activity.duration || 0
        break
      case "pace":
        values.pace = activity.pace || 0
        break
      case "speed":
        values.speed = activity.speed || 0
        break
      case "reps":
        values.reps = activity.reps || activity.repetitions || 0
        break
      case "sets":
        values.sets = activity.sets || 1
        break
    }
  })

  return values
}

// Helper to format time values
export const formatTime = (seconds) => {
  if (!seconds || seconds === 0) return "0:00"

  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, "0")}`
}
