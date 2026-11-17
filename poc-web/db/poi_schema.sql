-- 桃園市生活圈 POI 資料庫（正式版：PostgreSQL 14+ / PostGIS 3）
-- 匯入：psql -f db/poi_schema.sql && psql -f db/poi_seed.sql
-- 前端 PoC 沒有後端時改讀 public/data/poi.json，查詢邏輯與下方 poi_search() 相同。

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS poi (
  id            text PRIMARY KEY,                 -- 類別首字＋名稱與座標雜湊（重建時保持不變）
  name          text NOT NULL,
  category      text NOT NULL CHECK (category IN ('restaurant', 'attraction', 'museum', 'hotel', 'consume')),
  geom          geometry(Point, 4326) NOT NULL,
  district      text,                             -- 行政區（由地址解析，OSM 無地址者為空）
  address       text,
  phone         text,
  cuisine       text,                             -- 料理類型（中文，頓號分隔）
  opening_hours text,
  website       text,
  price         text,                             -- 票價／房價（原始文字）
  name_en       text,
  source        text NOT NULL,                    -- OSM / TYCG / OSM+TYCG
  source_url    text,
  description   text,
  enabled       boolean NOT NULL DEFAULT true,    -- 後台可停用個別 POI
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poi_geom_gix  ON poi USING gist (geography(geom));
CREATE INDEX IF NOT EXISTS poi_cat_idx   ON poi (category) WHERE enabled;
CREATE INDEX IF NOT EXISTS poi_name_trgm ON poi USING gin ((name || ' ' || coalesce(name_en, '') || ' ' || coalesce(cuisine, '') || ' ' || coalesce(address, '')) gin_trgm_ops);

-- 生活圈範圍查詢：中心點＋半徑（公尺），可加關鍵字與類別，依距離排序
CREATE OR REPLACE FUNCTION poi_search(
  p_lng double precision, p_lat double precision, p_radius_m double precision,
  p_keyword text DEFAULT NULL, p_categories text[] DEFAULT NULL, p_limit int DEFAULT 200
) RETURNS TABLE (id text, name text, category text, lng double precision, lat double precision, distance_m double precision, address text, cuisine text)
LANGUAGE sql STABLE AS $$
  SELECT p.id, p.name, p.category, ST_X(p.geom), ST_Y(p.geom),
         ST_Distance(geography(p.geom), geography(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))) AS distance_m,
         p.address, p.cuisine
  FROM poi p
  WHERE p.enabled
    AND ST_DWithin(geography(p.geom), geography(ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)), p_radius_m)
    AND (p_categories IS NULL OR p.category = ANY (p_categories))
    AND (p_keyword IS NULL OR p_keyword = '' OR
         (p.name || ' ' || coalesce(p.name_en, '') || ' ' || coalesce(p.cuisine, '') || ' ' || coalesce(p.address, '')) ILIKE '%' || p_keyword || '%')
  ORDER BY distance_m
  LIMIT p_limit;
$$;

-- 範例：桃園火車站步行 15 分鐘（約 1.2 公里）內的拉麵店
-- SELECT * FROM poi_search(121.3133, 24.9893, 1200, '拉麵', ARRAY['restaurant']);
