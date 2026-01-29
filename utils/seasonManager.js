// utils/seasonManager.js
export const SEASON_TYPES = {
    WEEKLY: "weekly",
    MONTHLY: "monthly",
    ALL_TIME: "all_time",
};

export const getCurrentSeason = (type = SEASON_TYPES.WEEKLY) => {
    const now = new Date();

    switch (type) {
        case SEASON_TYPES.WEEKLY:
            return getWeeklySeason(now);
        case SEASON_TYPES.MONTHLY:
            return getMonthlySeason(now);
        case SEASON_TYPES.ALL_TIME:
            return { type: "all_time", id: "all", startDate: null, endDate: null };
        default:
            return getWeeklySeason(now);
    }
};

const getWeeklySeason = (date) => {
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
    endOfWeek.setHours(23, 59, 59, 999);

    const weekNumber = getWeekNumber(date);
    const year = date.getFullYear();

    return {
        type: SEASON_TYPES.WEEKLY,
        id: `week-${weekNumber}-${year}`,
        startDate: startOfWeek,
        endDate: endOfWeek,
        displayName: `Week ${weekNumber}, ${year}`,
    };
};

const getMonthlySeason = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();

    const startOfMonth = new Date(year, month, 1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(year, month + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    return {
        type: SEASON_TYPES.MONTHLY,
        id: `month-${year}-${month}`,
        startDate: startOfMonth,
        endDate: endOfMonth,
        displayName: `${monthNames[month]} ${year}`,
    };
};

const getWeekNumber = (date) => {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
};
