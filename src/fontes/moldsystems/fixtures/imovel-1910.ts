import { MoldSystemsSolrDoc } from "../solr-doc"

// Documento Solr REAL obtido via /api/solr/search/ (campos relevantes ao mapeamento).
export const imovel1910: MoldSystemsSolrDoc = {
  idtProperty: 1910,
  indType: "L",
  indStatus: 1,
  indBusy: 0,
  flgShowSite: true,
  valLocation: 1050,
  valCondominium: 940,
  valMonthIptu: 105,
  totalRooms: 2,
  totalGarages: 2,
  namCategory: "Apartamentos",
  namSubCategory: "Padrão",
  namDistrict: "Vila Estádio",
  namCity: "Araçatuba",
  namState: "São Paulo",
  fullAddress: "AVENIDA SAUDADE, 999, Vila Estádio, Araçatuba - CEP: 16020-070, Apto. 111",
  desUriLandingPage: "condominio-edificio-residencial-park-mediterraneo",
  desResumeCharacteristics: "2 dormitórios, 2 total de banheiros, 1 cozinha, 2 garagens, Área útil 96,00 m²",
  jsonPhotos:
    '[{"desPhoto":"Sala","urlPhoto":"https://s3.amazonaws.com/msys-imob-imobiliariainnove/imovel/fotos/1910/300d0e31334f3816fee39cb5564f27ceAT.jpg","flgNotShowSite":0}]',
  jsonCharacteristics:
    '[{"desInformation":"96.00","desInformationFormatted":"96,00 m²","characteristics":{"idtCharacteristics":95}},{"desInformation":"2","desInformationFormatted":"2","characteristics":{"idtCharacteristics":176}}]',
  dtaUpdate: "2026-05-07T10:22:58Z",
  idtTenant: "516",
}
