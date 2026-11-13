import { buildSunshineScore } from "./sunshineScore.js";
import { buildNeonCrushScore } from "./neonCrushScore.js";
/** The synthesised score of each built-in synth song, by song id. */
export function scoreFor(id) {
    if (id === "neon-crush")
        return buildNeonCrushScore();
    return buildSunshineScore();
}
