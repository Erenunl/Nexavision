export const EUROVISION_POINTS = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] as const;
export type EurovisionPoint = (typeof EUROVISION_POINTS)[number];
