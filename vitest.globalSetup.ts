// Pin the timezone so local-date grouping tests behave the same everywhere.
export default function setup() {
  process.env.TZ = 'Europe/Bratislava'
}
