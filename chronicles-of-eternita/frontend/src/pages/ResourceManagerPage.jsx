import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import NavBar from '../components/NavBar.jsx';
import useAuth from '../hooks/useAuth.jsx';
import { AssetService, MapService } from '../services/api.js';

const buildPublicPath = (filePath) => `/${filePath.replace(/^\/*/, '')}`;

const ResourceManagerPage = () => {
  const { user, loading: authLoading } = useAuth();
  const [maps, setMaps] = useState([]);
  const [mapSearch, setMapSearch] = useState('');
  const [mapsLoading, setMapsLoading] = useState(false);
  const [assets, setAssets] = useState([]);
  const [assetSearch, setAssetSearch] = useState('');
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const isMJ = useMemo(() => user?.role === 'MJ', [user]);

  const loadMaps = useCallback(
    async (searchTerm = '') => {
      setMapsLoading(true);
      try {
        const params = searchTerm ? { search: searchTerm } : {};
        const { data } = await MapService.list(params);
        setMaps(data.maps);
      } finally {
        setMapsLoading(false);
      }
    },
    []
  );

  const loadAssets = useCallback(
    async (searchTerm = '') => {
      setAssetsLoading(true);
      try {
        const params = { category: 'token' };
        if (searchTerm) {
          params.search = searchTerm;
        }
        const { data } = await AssetService.list(params);
        setAssets(data.assets);
      } finally {
        setAssetsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!authLoading && isMJ && !initialized) {
      Promise.all([loadMaps(), loadAssets()]).finally(() => setInitialized(true));
    }
  }, [authLoading, isMJ, initialized, loadAssets, loadMaps]);

  const handleMapUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append('map', file);
    formData.append('name', file.name);
    const { data } = await MapService.upload(formData);
    setMaps((prev) => [data.map, ...prev.filter((map) => map.id !== data.map.id)]);
    event.target.value = '';
  };

  const handleMapDelete = async (mapId) => {
    await MapService.remove(mapId);
    setMaps((prev) => prev.filter((map) => map.id !== mapId));
  };

  const handleAssetUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const formData = new FormData();
    formData.append('asset', file);
    formData.append('name', file.name);
    formData.append('category', 'token');
    const { data } = await AssetService.upload(formData);
    setAssets((prev) => [data.asset, ...prev.filter((asset) => asset.id !== data.asset.id)]);
    event.target.value = '';
  };

  const handleAssetDelete = async (assetId) => {
    await AssetService.remove(assetId);
    setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
  };

  const handleMapSearch = async (event) => {
    event.preventDefault();
    await loadMaps(mapSearch.trim());
  };

  const handleAssetSearch = async (event) => {
    event.preventDefault();
    await loadAssets(assetSearch.trim());
  };

  if (authLoading || (isMJ && !initialized)) {
    return <div className="flex h-screen items-center justify-center text-xl">Chargement des ressources...</div>;
  }

  if (!isMJ) {
    return <Navigate to="/map" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex-1 space-y-8 bg-slate-900 p-6">
        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-emerald-400">Cartes disponibles</h2>
              <p className="text-sm text-slate-400">
                Gérez vos cartes téléversées, supprimez celles qui ne servent plus et ajoutez-en de nouvelles.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <span className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-900">Ajouter une carte</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleMapUpload} />
            </label>
          </div>
          <form onSubmit={handleMapSearch} className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              type="text"
              value={mapSearch}
              onChange={(event) => setMapSearch(event.target.value)}
              placeholder="Rechercher une carte par nom"
              className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
            >
              Rechercher
            </button>
          </form>
          {mapsLoading ? (
            <p className="text-sm text-slate-400">Chargement des cartes...</p>
          ) : maps.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune carte enregistrée pour le moment.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {maps.map((map) => (
                <div key={map.id} className="flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow">
                  <div className="relative h-40 bg-slate-900">
                    <img src={buildPublicPath(map.filePath)} alt={map.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div>
                      <h3 className="text-lg font-semibold text-white">{map.name}</h3>
                      <p className="text-xs text-slate-400">Ajoutée le {new Date(map.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleMapDelete(map.id)}
                      className="self-start rounded bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/40"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-emerald-400">Banque d'images pour les pions</h2>
              <p className="text-sm text-slate-400">
                Centralisez ici toutes les images que vous souhaitez réutiliser pour vos pions ennemis.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <span className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-900">Ajouter une image</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleAssetUpload} />
            </label>
          </div>
          <form onSubmit={handleAssetSearch} className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              type="text"
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
              placeholder="Rechercher une image par nom"
              className="flex-1 rounded bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="submit"
              className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
            >
              Rechercher
            </button>
          </form>
          {assetsLoading ? (
            <p className="text-sm text-slate-400">Chargement des images...</p>
          ) : assets.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune image enregistrée pour le moment.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {assets.map((asset) => (
                <div key={asset.id} className="flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-800 shadow">
                  <div className="relative h-32 bg-slate-900">
                    <img src={buildPublicPath(asset.filePath)} alt={asset.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3">
                    <span className="text-sm font-semibold text-white">{asset.name}</span>
                    <button
                      type="button"
                      onClick={() => handleAssetDelete(asset.id)}
                      className="self-start rounded bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/40"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default ResourceManagerPage;
