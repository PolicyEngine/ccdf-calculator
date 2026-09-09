'use client';

import { useState, memo, useMemo } from 'react';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const geoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// The TopoJSON carries FIPS ids; DC (11) is in the file but too small to click
// reliably, so it also appears in the ranked bar chart and the table.
const FIPS_TO_STATE = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
};

// Nine steps of the ui-kit teal ramp, declared in globals.css as --map-0..8.
const STEPS = 9;
const RAMP = Array.from({ length: STEPS }, (_, i) => `var(--map-${i})`);
const EMPTY = 'var(--map-empty)';

/**
 * US choropleth over a per-state metric.
 *
 * @param values      state code -> number (null or missing renders as "no data")
 * @param names       state code -> display name
 * @param subtitles   state code -> secondary tooltip line (the program name)
 * @param formatValue value -> display string
 */
function StateMap({
  values,
  names,
  subtitles,
  selectedState,
  onSelect,
  formatValue,
  lowLabel = 'Lower',
  highLabel = 'Higher',
}) {
  const [hoveredState, setHoveredState] = useState(null);

  const { min, max } = useMemo(() => {
    const numbers = Object.values(values || {}).filter(
      (v) => typeof v === 'number' && Number.isFinite(v),
    );
    if (numbers.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...numbers), max: Math.max(...numbers) };
  }, [values]);

  const colorFor = (code) => {
    const value = values?.[code];
    if (typeof value !== 'number' || !Number.isFinite(value)) return EMPTY;
    if (max === min) return RAMP[STEPS - 1];
    const ratio = (value - min) / (max - min);
    return RAMP[Math.min(Math.round(ratio * (STEPS - 1)), STEPS - 1)];
  };

  const describe = (code) => {
    if (!code) return null;
    const value = values?.[code];
    return (
      <>
        <strong>{names?.[code] || code}</strong>
        {subtitles?.[code] ? <span className="map-state-sub">{subtitles[code]}</span> : null}
        <span className="benefit-amount">
          {typeof value === 'number' && Number.isFinite(value)
            ? formatValue(value)
            : 'No data'}
        </span>
      </>
    );
  };

  return (
    <div
      className="state-map-container"
      role="img"
      aria-label="Map of the United States colored by the selected child care subsidy metric"
    >
      <div className="map-wrapper">
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1100 }}
          width={800}
          height={500}
          style={{ width: '100%', height: 'auto' }}
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const code = FIPS_TO_STATE[geo.id];
                if (!code) return null;
                const isSelected = code === selectedState;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={colorFor(code)}
                    stroke={isSelected ? 'var(--color-navy)' : 'var(--background)'}
                    strokeWidth={isSelected ? 1.5 : 0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { outline: 'none', cursor: 'pointer', opacity: 0.85 },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={() => setHoveredState(code)}
                    onMouseLeave={() => setHoveredState(null)}
                    onClick={() => onSelect && onSelect(code)}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>
      </div>

      <div className="map-state-info">
        <div
          className={`map-state-card selected ${
            hoveredState && hoveredState !== selectedState ? 'dimmed' : ''
          }`}
        >
          {describe(selectedState)}
        </div>
        {hoveredState && hoveredState !== selectedState && (
          <div className="map-state-card hovered">{describe(hoveredState)}</div>
        )}
      </div>

      <div className="heatmap-legend">
        <span className="legend-label">{lowLabel}</span>
        <div className="gradient-bar">
          {RAMP.map((color) => (
            <div key={color} className="gradient-step" style={{ background: color }} />
          ))}
        </div>
        <span className="legend-label">{highLabel}</span>
      </div>
    </div>
  );
}

export default memo(StateMap);
