pub fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Dni od 1970-01-01 dla daty kalendarza gregoriańskiego (algorytm H. Hinnanta).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Milisekundy od epoki jako `YYYY-MM-DDTHH:MM:SS.mmmZ` (algorytm civil_from_days H. Hinnanta).
pub fn rfc3339(ms: i64) -> String {
    let (days, rem) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z", rem / 3_600_000, rem / 60_000 % 60, rem / 1000 % 60, rem % 1000)
}

pub fn rfc3339_ms(s: &str) -> Option<i64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || b[13] != b':' || b[16] != b':' {
        return None;
    }
    let n = |a: usize, z: usize| s.get(a..z)?.parse::<i64>().ok();
    let (y, mo, d, h, mi, se) = (n(0, 4)?, n(5, 7)?, n(8, 10)?, n(11, 13)?, n(14, 16)?, n(17, 19)?);
    let mut rest = &s[19..];
    let ms = if let Some(frac) = rest.strip_prefix('.') {
        let digits: String = frac.chars().take_while(|c| c.is_ascii_digit()).collect();
        rest = &frac[digits.len()..];
        let padded = format!("{:0<3}", &digits[..digits.len().min(3)]);
        padded.parse::<i64>().ok()?
    } else { 0 };
    // strefa: `Z` albo `±HH:MM`
    let offset_s = match rest.as_bytes() {
        [b'Z'] => 0,
        [sign @ (b'+' | b'-'), _, _, b':', _, _] => {
            let v = rest[1..3].parse::<i64>().ok()? * 3600 + rest[4..6].parse::<i64>().ok()? * 60;
            if *sign == b'+' { v } else { -v }
        }
        _ => return None,
    };
    Some(((days_from_civil(y, mo, d) * 86_400 + h * 3600 + mi * 60 + se - offset_s) * 1000) + ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_rfc3339_utc() {
        assert_eq!(rfc3339_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(rfc3339_ms("2026-09-23T19:25:19.386Z"), Some(1_790_191_519_386));
        assert_eq!(rfc3339_ms("2026-09-23T19:25:19Z"), Some(1_790_191_519_000));
        assert_eq!(rfc3339_ms("nonsense"), None);
    }

    #[test]
    fn parses_numeric_offsets_and_microseconds() {
        // format odpowiedzi `api/oauth/usage`
        assert_eq!(rfc3339_ms("2026-09-25T18:20:00.013684+00:00"), Some(1_790_360_400_013));
        assert_eq!(rfc3339_ms("2026-09-25T20:20:00+02:00"), Some(1_790_360_400_000));
        assert_eq!(rfc3339_ms("2026-09-25T18:20:00+0"), None);
    }

    #[test]
    fn formats_rfc3339_utc() {
        assert_eq!(rfc3339(1_790_191_519_386), "2026-09-23T19:25:19.386Z");
        assert_eq!(rfc3339_ms(&rfc3339(0)), Some(0));
    }
}
