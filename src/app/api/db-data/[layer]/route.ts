import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

// Allowed layer names (matches db-data/*.json filenames without .json)
const ALLOWED_LAYERS = new Set([
  "blok_perancangan",
  "bridge",
  "cctv",
  "charting_km",
  "constructed_slope",
  "drainage",
  "earth_work",
  "feeder_pillar",
  "flexible_post",
  "gtmix",
  "gtnh_semasa",
  "jalan",
  "jalan_kejuruteraan",
  "komited_km",
  "location_map_aset",
  "location_map_aset_item",
  "lokasi_banjir",
  "ndcdb20",
  "ndcdb23",
  "pasar_awam",
  "pasar_malam",
  "pasar_sari",
  "pasar_tani",
  "road_hump",
  "road_marking_linear",
  "road_marking_point",
  "road_median",
  "road_shoulder",
  "sampah_haram",
  "sempadan_daerah",
  "sempadan_taman",
  "signboard",
  "sport_facility",
  "street_lighting",
  "taman_perumahan",
  "traffic_light",
  "warta_kawasan_lapang",
  "zon_ahli_majlis",
  "ekompaun_mpsp_summary",
  "maklumat_akaun_analytics",
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ layer: string }> }
) {
  const { layer } = await params;
  if (!layer || !ALLOWED_LAYERS.has(layer)) {
    return NextResponse.json(
      { error: "Invalid or unknown layer" },
      { status: 400 }
    );
  }

  try {
    const dbDataPath = path.join(process.cwd(), "db-data", `${layer}.json`);
    const raw = await readFile(dbDataPath, "utf-8");
    const data = JSON.parse(raw);
    // Map expects { [layer]: array }; db-data files are raw arrays
    const wrapped = Array.isArray(data) ? { [layer]: data } : data;
    return NextResponse.json(wrapped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to load layer data", detail: message },
      { status: 500 }
    );
  }
}
