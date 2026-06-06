"""Financial calculations and location-parsing utilities shared across modules."""


def compute_financials(
    rate: float,
    driver_pay: float,
    fuel_cost: float,
    tolls: float,
    miles: float,
) -> tuple[float, float, float]:
    """Return ``(net_profit, rpm, net_rpm)`` rounded to 2 decimals."""
    net_profit = rate - driver_pay - fuel_cost - tolls
    rpm = rate / miles if miles else 0
    net_rpm = net_profit / miles if miles else 0
    return round(net_profit, 2), round(rpm, 2), round(net_rpm, 2)


def split_city_state(val: str) -> tuple[str, str]:
    """Split ``"City, ST"`` into ``(city, state_code)``.

    Returns the original string and an empty state when no comma is present.
    """
    if "," in val:
        parts = [p.strip() for p in val.rsplit(",", 1)]
        return parts[0], parts[1][:2].upper() if len(parts) > 1 else ""
    return val, ""
