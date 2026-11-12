export const LM = {
    NOSE: 0,
    L_EAR: 7,
    R_EAR: 8,
    L_SHOULDER: 11,
    R_SHOULDER: 12,
    L_ELBOW: 13,
    R_ELBOW: 14,
    L_WRIST: 15,
    R_WRIST: 16,
    L_HIP: 23,
    R_HIP: 24,
    L_KNEE: 25,
    R_KNEE: 26,
    L_ANKLE: 27,
    R_ANKLE: 28,
};
export const POSE_LANDMARK_COUNT = 33;
/** The 12 landmarks the game depends on (shoulders, elbows, wrists, hips, knees, ankles). */
export const MAIN_POINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
export const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
];
export function emptyPose() {
    return Array.from({ length: POSE_LANDMARK_COUNT }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
}
