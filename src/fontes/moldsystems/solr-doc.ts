export interface MoldSystemsFoto {
  urlPhoto: string
  desPhoto?: string
  flgNotShowSite?: number
}

export interface MoldSystemsChar {
  desInformation?: string
  desInformationFormatted?: string
  characteristics?: { idtCharacteristics: number }
}

export interface MoldSystemsSolrDoc {
  idtProperty: number
  indType?: string
  indStatus?: number
  indBusy?: number | boolean
  flgShowSite?: boolean
  valLocation?: number
  valSales?: number
  valCondominium?: number
  valMonthIptu?: number
  totalRooms?: number
  totalGarages?: number
  namCategory?: string
  namSubCategory?: string
  namDistrict?: string
  namCity?: string
  namState?: string
  fullAddress?: string
  desUriLandingPage?: string
  desResumeCharacteristics?: string
  jsonPhotos?: string
  jsonCharacteristics?: string
  dtaUpdate?: string
  idtTenant?: string
  // --- Endereço estruturado ---
  namStreet?: string
  numNumber?: string | number
  numPostalArea?: string | number
  numFloor?: string | number
  desReferencePoint?: string
  latitudeAndLongitude?: string
  namCondominium?: string
  // --- Apresentação ---
  desTitleSite?: string
  desInformationSite?: string
  desObservation?: string
  // --- Mídia ---
  urlVideo?: string
  jsonPhotosCondominium?: string
  // --- Condomínio (características) ---
  jsonCondominiumCharacteristics?: string
  // --- Extras fiscais/diversos ---
  valIptu?: number
  numParcelsIptu?: number
  valSumLocationAndCondominium?: number
  numApartment?: string | number
  numBlock?: string | number
  numLandBlock?: string | number
  numLandLot?: string | number
  desAddressObservation?: string
  desBranchActivity?: string
  flg360?: boolean | number
  flgHideValSaleSite?: boolean | number
  flgHideValLocationSite?: boolean | number
  flgHighlight?: boolean | number
  dtaRegister?: string
  namCondominiumPlant?: string
  desAddressObservationCondominium?: string
}

export interface MoldSystemsContexto {
  clienteId: string
  origin: string // ex.: "https://imobiliariainnove.com.br"
  extraidoEm: string // ISO 8601, injetado (mantém o mapper determinístico)
}
