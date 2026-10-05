export interface EurovisionCountry {
  code: string;
  nameTr: string;
  flag: string;
  roleName: string;
}

const country = (code: string, nameTr: string, flag: string): EurovisionCountry => ({
  code,
  nameTr,
  flag,
  roleName: `${flag} ${nameTr}`,
});

export const EUROVISION_COUNTRIES: readonly EurovisionCountry[] = [
  country("AL", "Arnavutluk", "🇦🇱"),
  country("AD", "Andorra", "🇦🇩"),
  country("AM", "Ermenistan", "🇦🇲"),
  country("AU", "Avustralya", "🇦🇺"),
  country("AT", "Avusturya", "🇦🇹"),
  country("AZ", "Azerbaycan", "🇦🇿"),
  country("BY", "Belarus", "🇧🇾"),
  country("BE", "Belçika", "🇧🇪"),
  country("BA", "Bosna-Hersek", "🇧🇦"),
  country("BG", "Bulgaristan", "🇧🇬"),
  country("HR", "Hırvatistan", "🇭🇷"),
  country("CY", "Kıbrıs", "🇨🇾"),
  country("CZ", "Çekya", "🇨🇿"),
  country("DK", "Danimarka", "🇩🇰"),
  country("EE", "Estonya", "🇪🇪"),
  country("FI", "Finlandiya", "🇫🇮"),
  country("FR", "Fransa", "🇫🇷"),
  country("GE", "Gürcistan", "🇬🇪"),
  country("DE", "Almanya", "🇩🇪"),
  country("GR", "Yunanistan", "🇬🇷"),
  country("HU", "Macaristan", "🇭🇺"),
  country("IS", "İzlanda", "🇮🇸"),
  country("IE", "İrlanda", "🇮🇪"),
  country("IL", "İsrail", "🇮🇱"),
  country("IT", "İtalya", "🇮🇹"),
  country("LV", "Letonya", "🇱🇻"),
  country("LT", "Litvanya", "🇱🇹"),
  country("LU", "Lüksemburg", "🇱🇺"),
  country("MT", "Malta", "🇲🇹"),
  country("MD", "Moldova", "🇲🇩"),
  country("MC", "Monako", "🇲🇨"),
  country("ME", "Karadağ", "🇲🇪"),
  country("MA", "Fas", "🇲🇦"),
  country("NL", "Hollanda", "🇳🇱"),
  country("MK", "Kuzey Makedonya", "🇲🇰"),
  country("NO", "Norveç", "🇳🇴"),
  country("PL", "Polonya", "🇵🇱"),
  country("PT", "Portekiz", "🇵🇹"),
  country("RO", "Romanya", "🇷🇴"),
  country("RU", "Rusya", "🇷🇺"),
  country("SM", "San Marino", "🇸🇲"),
  country("RS", "Sırbistan", "🇷🇸"),
  country("SK", "Slovakya", "🇸🇰"),
  country("SI", "Slovenya", "🇸🇮"),
  country("ES", "İspanya", "🇪🇸"),
  country("SE", "İsveç", "🇸🇪"),
  country("CH", "İsviçre", "🇨🇭"),
  country("TR", "Türkiye", "🇹🇷"),
  country("UA", "Ukrayna", "🇺🇦"),
  country("GB", "Birleşik Krallık", "🇬🇧"),
] as const;

export const EUROVISION_COUNTRY_MAP = new Map(
  EUROVISION_COUNTRIES.map((entry) => [entry.code, entry]),
);

export function getCountry(countryCode: string): EurovisionCountry | null {
  return EUROVISION_COUNTRY_MAP.get(countryCode.toUpperCase()) ?? null;
}
