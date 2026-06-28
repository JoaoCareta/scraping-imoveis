// src/fontes/moldsystems/fixtures/imovel-3339.ts
import { MoldSystemsSolrDoc } from "../solr-doc"

// Documento Solr REAL (apartamento rico em Araçatuba) — campos relevantes ao mapeamento.
export const imovel3339: MoldSystemsSolrDoc = {
  idtProperty: 3339,
  indType: "V",
  indStatus: 1,
  indBusy: 0,
  flgShowSite: true,
  valSales: 350000,
  totalRooms: 3,
  totalGarages: 2,
  namCategory: "Apartamentos",
  namSubCategory: "Padrão",
  namDistrict: "Centro",
  namCity: "Araçatuba",
  namState: "São Paulo",
  fullAddress: "Residencial Madri, Centro, Araçatuba",
  desUriLandingPage: "residencial-madri",
  desResumeCharacteristics: "3 dormitórios, 2 total de banheiros, 2 garagens, Área útil 90,00 m²",
  jsonPhotos: "[]",
  // idt 97 Elevador Social (qtd 2), 96 Elevador de Serviço ("Sim"), 235 Sacada ("Sim"),
  // 15 Piscina ("Sim"), 24 Padrão ("Alto"), 95 Área útil (numérica), 9 Copas ("0"),
  // 160 Observação garagens (texto longo).
  jsonCharacteristics: JSON.stringify([
    { desInformation: "2", desInformationFormatted: "2,00", characteristics: { idtCharacteristics: 97 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 96 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 235 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 15 } },
    { desInformation: "Alto", desInformationFormatted: "Alto", characteristics: { idtCharacteristics: 24 } },
    { desInformation: "90.00", desInformationFormatted: "90,00 m²", characteristics: { idtCharacteristics: 95 } },
    { desInformation: "0", desInformationFormatted: "0", characteristics: { idtCharacteristics: 9 } },
    { desInformation: "terreo ", desInformationFormatted: "terreo ", characteristics: { idtCharacteristics: 160 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 9999999 } },
  ]),
  // --- endereço estruturado ---
  namStreet: "Rua Pará",
  numNumber: "70",
  numPostalArea: "16011015",
  numFloor: "4",
  desReferencePoint: "ao lado da praça central",
  latitudeAndLongitude: "-21.2112600000000,-50.4407300000000",
  namCondominium: "Residencial Madri",
  // --- apresentação ---
  desTitleSite: "Apartamento 3 dormitórios no Centro",
  desInformationSite: "Excelente apartamento reformado, próximo ao comércio.",
  desObservation: "Aceita financiamento bancário.",
  // --- mídia ---
  urlVideo: "https://youtube.com/shorts/abc123",
  jsonPhotosCondominium: '[{"urlPhoto":"https://s3/cond1.jpg","flgNotShowSite":0}]',
  // --- condomínio: características (mesmo dicionário; idt 75 Playground, 15 Piscina, 97 Elevador Social qtd) ---
  jsonCondominiumCharacteristics: JSON.stringify([
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 75 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 15 } },
    { desInformation: "1", desInformationFormatted: "1,00", characteristics: { idtCharacteristics: 97 } },
  ]),
  // --- extras ---
  valIptu: 1200,
  numParcelsIptu: 10,
  valSumLocationAndCondominium: 1990,
  numApartment: "402",
  numBlock: "B",
  desAddressObservation: "Fundos",
  flg360: 1,
  flgHighlight: 1,
  dtaRegister: "2024-03-18T00:00:00Z",
  dtaUpdate: "2026-05-07T10:22:58Z",
  idtTenant: "516",
}
