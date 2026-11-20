export function summarizeCatalog(cars) {
  return {
    count: cars.length,
    sorted: cars.every((car, index) => index === 0 || cars[index - 1].finalPriceCents <= car.finalPriceCents),
  };
}
