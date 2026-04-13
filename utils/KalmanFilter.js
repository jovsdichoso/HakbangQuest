// utils/KalmanFilter.js (or paste at top of MapScreen.js)
export class KalmanFilter {
    constructor(processNoise = 1, measurementNoise = 1, errorCovariance = 1) {
        this.processNoise = processNoise; 
        this.measurementNoise = measurementNoise; 
        this.errorCovariance = errorCovariance; 
        this.value = null; 
    }

    filter(measurement, accuracy) {
        if (accuracy) {
            this.measurementNoise = accuracy * accuracy;
        }

        if (this.value === null) {
            this.value = measurement;
            return measurement;
        }

        const predictedCovariance = this.errorCovariance + this.processNoise;

        const kalmanGain = predictedCovariance / (predictedCovariance + this.measurementNoise);
        this.value = this.value + kalmanGain * (measurement - this.value);
        this.errorCovariance = (1 - kalmanGain) * predictedCovariance;

        return this.value;
    }
}