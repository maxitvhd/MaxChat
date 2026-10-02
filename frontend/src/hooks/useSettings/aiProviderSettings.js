/**
 * @TercioSantos-1 |
 * api/configurações de IA da empresa |
 * api/get/lista de valores fechados (motores, providers, vozes) |
 * api/post/teste de conexão com um provider |
 */
import api from "../../services/api";

const useAiProviderSettings = () => {
  const getAll = async () => {
    const { data } = await api.request({
      url: "/aiSettings",
      method: "GET"
    });
    return data;
  };

  const getOptions = async () => {
    const { data } = await api.request({
      url: "/aiSettings/options",
      method: "GET"
    });
    return data;
  };

  const update = async (data) => {
    const { data: responseData } = await api.request({
      url: "/aiSettings",
      method: "PUT",
      data
    });
    return responseData;
  };

  const listarModelos = async (provider) => {
    const { data } = await api.request({
      url: "/aiSettings/models",
      method: "GET",
      params: { provider }
    });
    return data;
  };

  const listarColecoes = async () => {
    const { data } = await api.request({
      url: "/aiSettings/qdrant/collections",
      method: "GET"
    });
    return data;
  };

  const testar = async (provider) => {
    const { data } = await api.request({
      url: "/aiSettings/test",
      method: "POST",
      data: { provider }
    });
    return data;
  };

  return {
    getAll,
    getOptions,
    update,
    listarModelos,
    listarColecoes,
    testar
  };
};

export default useAiProviderSettings;