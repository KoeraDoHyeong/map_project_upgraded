// 지도 초기화
var map = L.map('map').setView([37.5665, 126.9780], 11); // 서울 중심 좌표

// OSM 타일 추가
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

// 지도 상호작용 비활성화 (데이터 로딩 전까지)
map.dragging.disable();
map.doubleClickZoom.disable();
map.scrollWheelZoom.disable();
map.boxZoom.disable();
map.keyboard.disable();
if (map.tap) map.tap.disable();

// 레이어 그룹 생성
var markerLayer = L.layerGroup().addTo(map);
var circleLayer = L.layerGroup().addTo(map);
var highlightLayer;

// 반경 입력 요소 가져오기
var radiusInput = document.getElementById('radius-input');

// 데이터 변수 선언
var adminAreas; // 행정구역 데이터
var adminLayer;
var subwayStationsData; // 지하철역 데이터
var adminAreasTree; // 행정구역 RBush 인덱스
var subwayStationsTree; // 지하철역 RBush 인덱스

// 데이터 로드 프로미스 배열
var dataPromises = [];

// 노선 색상을 가져오는 함수
function getLineColor(line) {
  const lineColors = {
    '1호선': '#0052A4',
    '2호선': '#00A84D',
    '3호선': '#EF7C1C',
    '4호선': '#00A1E9',
    '5호선': '#996CAC',
    '6호선': '#CD7C2F',
    '7호선': '#747F00',
    '8호선': '#E6186C',
    '9호선': '#AA9872',
    '인천1호선': '#7CA8D5',
    '경의중앙선': '#77C4A3',
    '공항철도': '#0090D2',
    '경춘선': '#178C72',
    '신분당선': '#D31145',
    '수인분당선': '#FABE00',
    '우이신설선': '#B0CE18',
  };
  return lineColors[line] || '#000000';
}

// 행정구역 데이터 불러오기 (서울, 경기도 및 인천)
var adminDataPromiseSeoul = fetch('seoul_dong.geojson')
  .then(response => response.json())
  .then(data => {
    return { area: 'seoul', data: data };
  })
  .catch(error => {
    console.error('서울 행정구역 데이터를 불러오는 중 에러 발생:', error);
    alert('서울 행정구역 데이터를 불러오는 중 에러가 발생했습니다.');
  });

var adminDataPromiseGyeonggi = fetch('gyeonggi_dong_fixed_with_all_levels.geojson')
  .then(response => response.json())
  .then(data => {
    return { area: 'gyeonggi', data: data };
  })
  .catch(error => {
    console.error('경기도 행정구역 데이터를 불러오는 중 에러 발생:', error);
    alert('경기도 행정구역 데이터를 불러오는 중 에러가 발생했습니다.');
  });

var adminDataPromiseIncheon = fetch('incheon_dong_fixed_with_all_levels.geojson')
  .then(response => response.json())
  .then(data => {
    return { area: 'incheon', data: data };
  })
  .catch(error => {
    console.error('인천 행정구역 데이터를 불러오는 중 에러 발생:', error);
    alert('인천 행정구역 데이터를 불러오는 중 에러가 발생했습니다.');
  });

Promise.all([adminDataPromiseSeoul, adminDataPromiseGyeonggi, adminDataPromiseIncheon])
  .then(results => {
    // 서울, 경기도, 인천 데이터를 하나의 FeatureCollection으로 결합
    adminAreas = results.reduce((acc, result) => {
      if (result) {
        acc.features = acc.features.concat(result.data.features);
      }
      return acc;
    }, { type: 'FeatureCollection', features: [] });

    // RBush를 사용하여 행정구역 인덱싱
    adminAreasTree = rbush();
    var adminItems = adminAreas.features.map(function (feature) {
      var bbox = turf.bbox(feature);
      return {
        minX: bbox[0],
        minY: bbox[1],
        maxX: bbox[2],
        maxY: bbox[3],
        feature: feature
      };
    });
    adminAreasTree.load(adminItems);

    // 지도에 행정구역 경계 표시 (선택 사항)
    adminLayer = L.geoJSON(adminAreas, {
      style: {
        color: '#3388ff',
        weight: 1,
        fillOpacity: 0.2,
      },
    }).addTo(map);
  })
  .catch(error => {
    console.error('행정구역 데이터를 불러오는 중 에러 발생:', error);
  });

dataPromises.push(adminDataPromiseSeoul);
dataPromises.push(adminDataPromiseGyeonggi);
dataPromises.push(adminDataPromiseIncheon);

// 지하철역 데이터 불러오기
var subwayDataPromise = fetch('seoul_metro.geojson')
  .then(response => response.json())
  .then(data => {
    subwayStationsData = data;

    // RBush를 사용하여 지하철역 인덱싱
    subwayStationsTree = rbush();
    var stationItems = subwayStationsData.features.map(function(feature) {
      var coords = feature.geometry.coordinates;
      return {
        minX: coords[0],
        minY: coords[1],
        maxX: coords[0],
        maxY: coords[1],
        feature: feature
      };
    });
    subwayStationsTree.load(stationItems);
  })
  .catch(error => {
    console.error('지하철역 데이터를 불러오는 중 에러 발생:', error);
    alert('지하철역 데이터를 불러오는 중 에러가 발생했습니다.');
  });

dataPromises.push(subwayDataPromise);

// 서울 지하철 노선 경로를 지도에 추가 (노선도 시각화)
var subwayLinesPromise = fetch('seoul_metro_lines.geojson')
  .then(response => response.json())
  .then(subwayLines => {
    L.geoJSON(subwayLines, {
      style: function (feature) {
        return {
          color: getLineColor(feature.properties.line),
          weight: 3,
          opacity: 0.85
        };
      }
    }).addTo(map);
  })
  .catch(error => {
    console.error('지하철 노선 데이터를 불러오는 중 에러 발생:', error);
    alert('지하철 노선 데이터를 불러오는 중 에러가 발생했습니다.');
  });

dataPromises.push(subwayLinesPromise);

// 모든 데이터 로드가 완료되면 지도 상호작용 활성화
Promise.all(dataPromises).then(() => {
  // 지도 상호작용 활성화
  map.dragging.enable();
  map.doubleClickZoom.enable();
  map.scrollWheelZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
  if (map.tap) map.tap.enable();
}).catch(error => {
  console.error('데이터 로딩 중 에러 발생:', error);
});

// 병원 분과와 관련된 키워드 구조화
const departmentKeywords = {
  "항문외과": ["항문외과", "항외과", "치질병원", "치질수술병원", "치질수술잘하는곳", "내시경병원"],
  "내과": ["내과", "소화기내과", "호흡기내과", "심장내과", "내시경 병원", "건강검진 병원", "건강검진", "대장내시경 병원", "위내시경 병원"],
  "정형외과": ["정형외과", "디스크병원", "허리디스크병원", "목디스크병원", "재활병원", "관절", "골절", "디스크"],
  "신경외과": ["신경외과", "두통", "뇌출혈", "허리디스크"],
  "산부인과": ["산부인과", "부인과", "출산", "여성클리닉", "자궁경부암 건강검진"],
  "소아청소년과": ["소아청소년과", "소아과", "아이", "소아질환"],
  "피부과": ["피부과", "여드름", "리프팅", "피부질환"],
  "안과": ["안과", "백내장", "라식", "눈수술"],
  "이비인후과": ["이비인후과", "비염", "코막힘", "목감기"],
  "비뇨의학과": ["비뇨의학과", "비뇨기과", "전립선", "요로결석"],
  "재활의학과": ["재활의학과", "물리치료", "재활치료", "운동치료"],
  "정신건강의학과": ["정신건강의학과", "우울증", "불안장애", "정신과"],
  "가정의학과": ["가정의학과", "건강검진", "다이어트", "비만클리닉"],
  "흉부외과": ["흉부외과", "심장수술", "폐질환", "대동맥수술"],
  "치과": ["치과", "임플란트", "교정", "치아미백"],
  "성형외과": ["성형외과", "쌍꺼풀수술", "코수술"],
  "마취통증의학과": ["통증의원", "통증의학과", "마취통증의학과", "통증과", "디스크병원", "허리디스크병원", "목디스크병원", "디스크"]
};

// 키워드 저장 변수
let keywords = [];

// 동 이름을 통일하는 함수
function normalizeDongName(dongName) {
  return dongName.replace(/(\d+)(?=동$)/, '');
}

// "구"를 제외하고 "동"만 반환하는 함수
function extractDongOnly(areaName) {
  return areaName.replace(/.*구\s?/, '').trim();
}

// 키워드 표시 함수
function displayKeywords() {
  var keywordListElement = document.getElementById('keyword-list');
  keywordListElement.innerHTML = ''; // 기존 내용 초기화

  if (keywords.length > 0) {
    keywords.forEach(function(keyword) {
      var keywordItem = document.createElement('span');
      keywordItem.textContent = keyword + ', ';
      keywordListElement.appendChild(keywordItem);
    });
  } else {
    keywordListElement.textContent = '생성된 키워드가 없습니다.';
  }
}

// 범위 내 결과를 표시하는 함수
function displayResults(areaNames, stationNames) {
  var areaList = document.getElementById('area-list');
  areaList.innerHTML = ''; // 이전 결과 제거

  // 행정구역 결과 표시
  var resultHTML = '<h3>범위 내 행정구역 (구/동):</h3>';

  if (areaNames.length === 0) {
    resultHTML += '<ul><li>범위 내에 행정구역이 없습니다.</li></ul>';
  } else {
    resultHTML += '<ul>' + areaNames.map(name => `<li>${name}</li>`).join('') + '</ul>';
  }

  // 지하철역 결과 표시
  resultHTML += '<h3>범위 내 지하철역:</h3>';
  if (stationNames.length === 0) {
    resultHTML += '<ul><li>범위 내에 지하철역이 없습니다.</li></ul>';
  } else {
    resultHTML += '<ul>' + stationNames.map(name => `<li>${name}</li>`).join('') + '</ul>';
  }

  // 결과를 페이지에 삽입
  areaList.innerHTML = resultHTML;
}

// 키워드 생성 함수
function generateKeywords(clickedPoint, radius) {
  // 선택된 병원 분과 가져오기
  var selectedDepartment = document.getElementById('department-select').value;
  if (!selectedDepartment) {
    alert('먼저 병원 분과를 선택하세요!');
    return;
  }

  // 선택된 분과에 해당하는 하위 키워드 가져오기
  var relatedKeywords = departmentKeywords[selectedDepartment];
  if (!relatedKeywords) {
    alert('선택된 분과에 대한 키워드가 없습니다.');
    return;
  }

  // Turf.js 포인트 생성
  var point = turf.point([clickedPoint.lng, clickedPoint.lat]);

  // 버퍼 생성 (반경 내 영역)
  var buffer = turf.buffer(point, radius, { units: 'meters' });

  var bufferBbox = turf.bbox(buffer);

  var insideAreasSet = new Set(); // Set을 사용해 중복 제거
  var insideStationsSet = new Set(); // Set을 사용해 중복 제거

  // 행정구역 검색 (RBush 사용)
  var possibleFeatures = adminAreasTree.search({
    minX: bufferBbox[0],
    minY: bufferBbox[1],
    maxX: bufferBbox[2],
    maxY: bufferBbox[3]
  }).map(item => item.feature);

  possibleFeatures.forEach(function(feature) {
    var intersects = turf.booleanIntersects(buffer, feature);
    if (intersects) {
      let areaName = feature.properties.adm_nm.replace('서울특별시 ', '').trim();
      areaName = normalizeDongName(areaName);
      if (areaName.includes('구') && areaName.includes('동')) {
        insideAreasSet.add(areaName);
      }
    }
  });

  // 지하철역 검색 (RBush 사용)
  var possibleStations = subwayStationsTree.search({
    minX: bufferBbox[0],
    minY: bufferBbox[1],
    maxX: bufferBbox[2],
    maxY: bufferBbox[3]
  }).map(item => item.feature);

  possibleStations.forEach(function(station) {
    const lat = station.geometry.coordinates[1];
    const lng = station.geometry.coordinates[0];

    if (typeof lat === 'number' && typeof lng === 'number') {
      var stationPoint = turf.point([lng, lat]);
      var isInside = turf.booleanPointInPolygon(stationPoint, buffer);

      if (isInside) {
        const stationName = station.properties.name + '역';
        insideStationsSet.add(stationName);

        // 역이 속한 노선의 색상 가져오기
        const lineColor = getLineColor(station.properties.line);

        // 커스텀 심볼(별표) 추가 (해당 역의 색상 적용)
        const icon = L.divIcon({
          className: 'custom-icon',
          html: `
            <div style="
              color: ${lineColor};
              font-size: 25px;
              opacity: 0.85;
              text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
            ">★</div>`,
          iconSize: [25, 25],
          iconAnchor: [12, 12]
        });

        L.marker([lat, lng], { icon: icon }).addTo(markerLayer).bindPopup(stationName);
      }
    } else {
      console.error('지하철역 좌표 오류 (숫자가 아님):', { lat, lng });
    }
  });

  // 키워드 생성 로직
  keywords = [];

  // 동 이름과 분과 관련 키워드를 조합
  Array.from(insideAreasSet).forEach(function(area) {
    const dongOnly = extractDongOnly(area);
    relatedKeywords.forEach(function(keyword) {
      keywords.push(`${dongOnly} ${keyword}`);
    });
  });

  // 지하철역 이름과 분과 관련 키워드를 조합
  Array.from(insideStationsSet).forEach(function(station) {
    relatedKeywords.forEach(function(keyword) {
      keywords.push(`${station} ${keyword}`);
    });
  });

  // 범위 내 동과 지하철역을 화면에 표시
  displayResults(Array.from(insideAreasSet), Array.from(insideStationsSet));

  // 생성된 키워드를 화면에 표시
  displayKeywords();

  // 범위 내의 행정구역을 지도에 강조 표시
  highlightIntersectingAreas(Array.from(insideAreasSet));
}

// 강조 표시 함수 (행정구역만 강조)
function highlightIntersectingAreas(areaNames) {
  var highlightFeatures = adminAreas.features.filter(function (feature) {
    let areaName = feature.properties.adm_nm.replace('서울특별시 ', '').trim();
    areaName = normalizeDongName(areaName);
    return areaNames.includes(areaName);
  });

  if (highlightLayer) {
    map.removeLayer(highlightLayer);
  }

  highlightLayer = L.geoJSON(
    { type: 'FeatureCollection', features: highlightFeatures },
    {
      style: {
        color: 'orange',
        weight: 2,
        fillOpacity: 0.3,
      },
    }
  ).addTo(map);
}

// 지도 클릭 이벤트 처리
map.on('click', function (e) {
  var clickedPoint = e.latlng;
  var radius = parseInt(document.getElementById('radius-input').value) || 1000;

  // 이전 마커와 원 제거
  markerLayer.clearLayers();
  circleLayer.clearLayers();

  // 마커 추가
  L.marker(clickedPoint).addTo(markerLayer);

  // 원 추가
  var circle = L.circle(clickedPoint, {
    radius: radius,
    color: 'red',
    fillOpacity: 0.1,
  }).addTo(circleLayer);

  // 키워드 생성 함수 호출
  generateKeywords(clickedPoint, radius);
});

// 주소 입력 필드와 자동 완성 결과 리스트 요소 가져오기
var addressInput = document.getElementById('address-input');
var suggestionList = document.getElementById('suggestion-list');
var searchAddressBtn = document.getElementById('search-address-btn');
var departmentSelect = document.getElementById('department-select');

// 엔터 키 입력 시 검색 실행
addressInput.addEventListener('keydown', function(event) {
  if (event.key === 'Enter') {
    event.preventDefault(); // 폼 제출 방지
    searchAddress();
  }
});

// 검색 버튼 클릭 이벤트
searchAddressBtn.addEventListener('click', function() {
  searchAddress();
});

// 입력 이벤트 리스너 추가
addressInput.addEventListener('input', function() {
  var query = addressInput.value.trim();
  if (!query) {
    suggestionList.innerHTML = '';
    return;
  }

  // Kakao 장소 검색 서비스 객체 생성
  var places = new kakao.maps.services.Places();

  // 키워드로 장소 검색
  places.keywordSearch(query, function(result, status) {
    if (status === kakao.maps.services.Status.OK) {
      // 검색 결과를 표시
      displaySuggestions(result);
    } else {
      suggestionList.innerHTML = '';
    }
  });
});

// 검색 함수 정의
function searchAddress() {
  var address = addressInput.value.trim();
  if (!address) {
    alert('검색할 주소를 입력하세요.');
    return;
  }

  // 선택된 병원 분과 가져오기
  var selectedDepartment = departmentSelect.value;
  if (!selectedDepartment) {
    alert('먼저 병원 분과를 선택하세요!');
    return;
  }

  // Kakao 장소 검색 서비스 객체 생성
  var places = new kakao.maps.services.Places();

  // 키워드로 장소 검색
  places.keywordSearch(address, function(result, status) {
    if (status === kakao.maps.services.Status.OK) {
      // 첫 번째 결과 사용
      var item = result[0];
      addressInput.value = item.address_name;

      // 선택된 주소의 좌표를 가져옵니다.
      var lat = parseFloat(item.y);
      var lon = parseFloat(item.x);

      var clickedPoint = L.latLng(lat, lon);

      // 지도 이동 및 마커 표시 등
      map.setView([lat, lon], 14);

      // 반경 값 가져오기 (미터 단위)
      var radius = parseInt(radiusInput.value) || 1000;

      // 이전 마커와 원 제거
      markerLayer.clearLayers();
      circleLayer.clearLayers();

      // 마커 추가
      L.marker(clickedPoint).addTo(markerLayer);

      // 원 추가
      var circle = L.circle(clickedPoint, {
        radius: radius,
        color: 'red',
        fillOpacity: 0.1,
      }).addTo(circleLayer);

      // 키워드 생성 함수 호출
      generateKeywords(clickedPoint, radius);

      // 자동 완성 결과 리스트 닫기
      suggestionList.innerHTML = '';
    } else {
      alert('해당 주소를 찾을 수 없습니다. 다른 주소를 입력해보세요.');
    }
  });
}

// 검색 결과를 표시하는 함수
function displaySuggestions(suggestions) {
  suggestionList.innerHTML = '';
  suggestions.forEach(function(item) {
    var listItem = document.createElement('li');
    listItem.textContent = item.address_name;
    listItem.addEventListener('click', function() {
      // 주소를 입력 필드에 설정하고, 리스트를 비웁니다.
      addressInput.value = item.address_name;
      suggestionList.innerHTML = '';

      // 선택된 주소로 검색 실행
      searchAddress();
    });
    suggestionList.appendChild(listItem);
  });
}

// 키워드 다운로드 기능
document.getElementById('download-btn').addEventListener('click', function() {
  if (keywords.length === 0) {
    alert('생성된 키워드가 없습니다.');
    return;
  }

  var dataStr = "data:text/plain;charset=utf-8," + encodeURIComponent(keywords.join('\n'));
  var downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", "generated_keywords.txt");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
});
