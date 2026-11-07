export const ROAD_WIDTH = {
  motorway: 16,
  motorway_link: 9,
  trunk: 14,
  trunk_link: 9,
  primary: 12,
  primary_link: 8,
  secondary: 10,
  secondary_link: 8,
  tertiary: 8,
  tertiary_link: 7,
  residential: 6.5,
  unclassified: 6.5,
  living_street: 5.5,
  pedestrian: 6,
  service: 4.2,
};

export function roadWidth(roadClass) {
  return ROAD_WIDTH[roadClass] || 6;
}

export const ROAD_CLASS_PATTERN =
  /^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|pedestrian|service)$/;
