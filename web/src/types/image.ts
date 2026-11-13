export type SeedanceImageRole = "reference_image" | "first_frame" | "last_frame";

export type ReferenceImage = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    seedanceRole?: SeedanceImageRole;
    seedanceOrder?: number;
    width?: number;
    height?: number;
};
