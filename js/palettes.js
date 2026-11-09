// Cat coats only: logical color IDs and matching rules never change.
window.CatPalettes = (() => {
    const names = ['pink', 'purple', 'navy', 'orange', 'green'];
    const options = [{"id": 0, "colors": ["#FAFBFD", "#BEC1CA", "#FDD58D", "#5B6179", "#E5DEFD"]}, {"id": 1, "colors": ["#EAB64B", "#4E9BCD", "#344365", "#DB7A53", "#9A6D98"]}, {"id": 2, "colors": ["#DF6B84", "#4F9DC7", "#465174", "#DEAB4F", "#64A68D"]}, {"id": 3, "colors": ["#E398B0", "#87B8DC", "#50486B", "#D6AD61", "#3F8C7B"]}];
    const normalize = id => options.some(option => option.id === id) ? id : 0;
    const getColors = id => {
        const palette = options[normalize(id)];
        const base = 'assets/images/cats/' + (palette.id === 0 ? 'palette_reference_clean/' : `palette_${palette.id}/`);
        return names.map((name, i) => ({
            id: i, name, hex: palette.colors[i],
            normal: `${base}cat_${name}.png`, blink: `${base}cat_${name}_blink.png`
        }));
    };
    return { options, normalize, getColors };
})();
