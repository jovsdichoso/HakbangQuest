// utils/KalmanFilter.js (or paste at top of MapScreen.js)
export class KalmanFilter {
    constructor(processNoise = 1, measurementNoise = 1, errorCovariance = 1) {
        this.processNoise = processNoise; // Q: Variance of the process noise (how much user moves)
        this.measurementNoise = measurementNoise; // R: Variance of measurement noise (GPS accuracy)
        this.errorCovariance = errorCovariance; // P: Estimate error
        this.value = null; // Current estimated value (lat or lng)
    }

    filter(measurement, accuracy) {
        // If accuracy is provided, we can dynamically adjust measurement noise (R)
        // Higher accuracy (lower number) = lower noise = trust measurement more
        if (accuracy) {
            this.measurementNoise = accuracy * accuracy;
        }

        if (this.value === null) {
            this.value = measurement;
            return measurement;
        }

        // Prediction phase
        const predictedCovariance = this.errorCovariance + this.processNoise;

        // Update phase
        const kalmanGain = predictedCovariance / (predictedCovariance + this.measurementNoise);
        this.value = this.value + kalmanGain * (measurement - this.value);
        this.errorCovariance = (1 - kalmanGain) * predictedCovariance;

        return this.value;
    }
}