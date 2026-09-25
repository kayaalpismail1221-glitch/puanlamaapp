import ExpoModulesCore
import MapKit

/// Uygulama içi yol tarifi: Apple'ın rota servisi (MKDirections). Anahtar ya da ücret gerektirmez.
/// Yürüyüş ve araç için rota çizgisi, süre, mesafe ve adım adım talimat; toplu taşıma için yalnızca süre
/// (MapKit toplu taşımada rota çizgisi vermez).
public class PuanlaDirectionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PuanlaDirections")

    AsyncFunction("route") { (from: Coordinate, to: Coordinate, mode: String) async throws -> [String: Any] in
      let request = Self.request(from: from, to: to)
      request.transportType = mode == "walking" ? .walking : .automobile
      let response = try await MKDirections(request: request).calculate()
      guard let route = response.routes.first else {
        throw NoRouteException()
      }

      let steps: [[String: Any]] = route.steps.compactMap { step in
        let text = step.instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let end = Self.coordinates(of: step.polyline).last else {
          return nil
        }
        return [
          "instruction": text,
          "distance": step.distance,
          "latitude": end.latitude,
          "longitude": end.longitude,
        ]
      }

      return [
        "distance": route.distance,
        "duration": route.expectedTravelTime,
        "coordinates": Self.coordinates(of: route.polyline).map { [$0.latitude, $0.longitude] },
        "steps": steps,
      ]
    }

    AsyncFunction("eta") { (from: Coordinate, to: Coordinate, mode: String) async throws -> Double in
      let request = Self.request(from: from, to: to)
      request.transportType = mode == "transit" ? .transit : (mode == "walking" ? .walking : .automobile)
      let response = try await MKDirections(request: request).calculateETA()
      return response.expectedTravelTime
    }
  }

  private static func request(from: Coordinate, to: Coordinate) -> MKDirections.Request {
    let request = MKDirections.Request()
    request.source = MKMapItem(placemark: MKPlacemark(coordinate: from.location))
    request.destination = MKMapItem(placemark: MKPlacemark(coordinate: to.location))
    request.requestsAlternateRoutes = false
    return request
  }

  private static func coordinates(of polyline: MKPolyline) -> [CLLocationCoordinate2D] {
    let count = polyline.pointCount
    guard count > 0 else {
      return []
    }
    var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: count)
    polyline.getCoordinates(&coords, range: NSRange(location: 0, length: count))
    return coords
  }
}

struct Coordinate: Record {
  @Field var latitude: Double = 0
  @Field var longitude: Double = 0

  var location: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

final class NoRouteException: Exception {
  override var reason: String {
    "No route found"
  }
}
