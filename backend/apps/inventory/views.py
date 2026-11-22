import json
from rest_framework import viewsets, permissions, filters, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    Store,
    Product,
    Variant,
    StoreInventory,
    ServerEvent,
    SyncEvent,
    StockLedgerEntry,
    Sale,
    SaleItem,
)
from .serializers import (
    StoreSerializer,
    ProductSerializer,
    VariantSerializer,
    StoreInventorySerializer,
    ServerEventSerializer,
    SyncEventSerializer,
    StockLedgerEntrySerializer,
    SaleSerializer,
    SaleWriteSerializer,
    SaleItemSerializer,
)
from .sync_service import (
    get_server_events_for_store,
    process_sync_batch,
    resolve_store,
)


class StoreViewSet(viewsets.ModelViewSet):
    queryset = Store.objects.all()
    serializer_class = StoreSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'code']
    ordering_fields = ['name', 'code', 'created_at']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.prefetch_related('variants').all()
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'style_code', 'category', 'description']
    ordering_fields = ['name', 'style_code', 'created_at']


class VariantViewSet(viewsets.ModelViewSet):
    queryset = Variant.objects.select_related('product').all()
    serializer_class = VariantSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product', 'size', 'color', 'is_active']
    search_fields = ['sku', 'barcode', 'product__name', 'product__style_code']
    ordering_fields = ['sku', 'price', 'created_at']


class StoreInventoryViewSet(viewsets.ModelViewSet):
    queryset = StoreInventory.objects.select_related('store', 'variant', 'variant__product').all()
    serializer_class = StoreInventorySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['store', 'variant']
    search_fields = ['store__name', 'store__code', 'variant__sku', 'variant__barcode', 'variant__product__name']
    ordering_fields = ['quantity_on_hand', 'updated_at']


class ServerEventViewSet(viewsets.ModelViewSet):
    """
    Replication stream endpoint for offline stores to pull new events
    since their last synchronized seq_id.
    """
    queryset = ServerEvent.objects.select_related('store').all()
    serializer_class = ServerEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['store', 'event_type']
    ordering_fields = ['seq_id', 'created_at']

    def get_queryset(self):
        qs = super().get_queryset()
        since_seq = self.request.query_params.get('since_seq')
        if since_seq is not None:
            try:
                qs = qs.filter(seq_id__gt=int(since_seq))
            except ValueError:
                pass
        return qs


class SyncEventViewSet(viewsets.ModelViewSet):
    """
    Ingestion endpoint for stores to push local sales, returns, and adjustments.
    Idempotent on event_id.
    """
    queryset = SyncEvent.objects.select_related('store').all()
    serializer_class = SyncEventSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['store', 'status', 'event_type']
    search_fields = ['event_type', 'store__name', 'store__code']
    ordering_fields = ['created_at', 'processed_at']


class StockLedgerEntryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Audit log stream for every stock change across online and offline stores.
    """
    queryset = StockLedgerEntry.objects.select_related('store', 'variant', 'variant__product').all()
    serializer_class = StockLedgerEntrySerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['store', 'reason', 'sync_source', 'variant']
    search_fields = ['store__name', 'store__code', 'variant__sku', 'variant__barcode', 'notes']
    ordering_fields = ['timestamp', 'resulting_balance', 'delta']


# ─────────────────────────────────────────────────────────────────────────────
# Dedicated Synchronization Endpoints
# ─────────────────────────────────────────────────────────────────────────────

class SyncPullView(APIView):
    """
    Pull: GET /api/sync/pull/
    Returns ServerEvent rows with seq_id > after_seq matching store_id or store IS NULL,
    ordered by seq_id and paginated up to 500 rows.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def get(self, request, *args, **kwargs):
        try:
            after_seq = int(request.query_params.get('after_seq', 0))
        except (ValueError, TypeError):
            after_seq = 0

        store_id = request.query_params.get('store_id') or request.query_params.get('store')

        try:
            limit = int(request.query_params.get('limit', 500))
        except (ValueError, TypeError):
            limit = 500

        events = get_server_events_for_store(store_id, after_seq=after_seq, limit=limit)
        serialized_events = ServerEventSerializer(events, many=True).data

        latest_seq = events[-1].seq_id if events else after_seq

        return Response({
            "status": "success",
            "after_seq": after_seq,
            "latest_seq": latest_seq,
            "count": len(events),
            "server_events": serialized_events,
        }, status=status.HTTP_200_OK)


class SyncPushView(APIView):
    """
    Push: POST /api/sync/push/
    Accepts SyncEvent batches, skips already-processed event_ids idempotently,
    applies variant inventory deltas (allowing negative balances to be flagged
    rather than blocking sales), and writes StockLedgerEntry rows.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]

    def post(self, request, *args, **kwargs):
        data = request.data
        default_store = None

        if isinstance(data, list):
            events = data
        elif isinstance(data, dict):
            events = data.get('events', [data])
            default_store = data.get('store_id') or data.get('store')
        else:
            return Response(
                {"error": "Invalid payload format. Expected list of events or object with 'events'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = process_sync_batch(
            events_data=events,
            default_store=default_store,
            sync_source=StockLedgerEntry.SyncSource.AUTO_SYNC,
        )

        return Response({
            "status": "success",
            "acked_event_ids": result["acked_event_ids"],
            "processed_count": result["processed_count"],
            "skipped_count": result["skipped_count"],
            "errors": result["errors"],
        }, status=status.HTTP_200_OK)


class SyncBundleView(APIView):
    """
    Manual JSON Bundle: POST /api/sync/bundle/
    Accepts an exported JSON file (via multipart/form-data) or JSON payload containing
    the store's profile (store_id, last_applied_seq) and pending SyncEvents.
    Processes events idempotently with sync_source=MANUAL_FILE, and returns response
    JSON with acked event_ids plus new ServerEvents (seq_id ordered) for the store
    to import back offline.
    """
    permission_classes = [permissions.IsAuthenticatedOrReadOnly]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, *args, **kwargs):
        # 1. Parse JSON from file upload or JSON request body
        bundle_data = None
        uploaded_file = request.FILES.get('file') or request.FILES.get('bundle')

        if uploaded_file:
            try:
                raw_content = uploaded_file.read().decode('utf-8')
                bundle_data = json.loads(raw_content)
            except Exception as e:
                return Response(
                    {"error": f"Failed to parse uploaded JSON file: {str(e)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        elif isinstance(request.data, dict):
            bundle_data = request.data
        else:
            return Response(
                {"error": "No JSON bundle provided in request body or file upload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        store_identifier = bundle_data.get('store_id') or bundle_data.get('store')
        store = resolve_store(store_identifier)
        if not store:
            return Response(
                {"error": f"Store '{store_identifier}' not found in system."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            last_applied_seq = int(bundle_data.get('last_applied_seq', 0))
        except (ValueError, TypeError):
            last_applied_seq = 0

        pending_events = bundle_data.get('events') or bundle_data.get('sync_events') or []

        # 2. Process pending SyncEvents idempotently
        result = process_sync_batch(
            events_data=pending_events,
            default_store=store,
            sync_source=StockLedgerEntry.SyncSource.MANUAL_FILE,
        )

        # 3. Fetch new ServerEvents (seq_id > last_applied_seq) matching store or store IS NULL
        new_events = get_server_events_for_store(
            store_identifier=store,
            after_seq=last_applied_seq,
            limit=500,
        )
        serialized_new_events = ServerEventSerializer(new_events, many=True).data
        latest_seq = new_events[-1].seq_id if new_events else last_applied_seq

        return Response({
            "status": "success",
            "store_id": store.id,
            "store_code": store.code,
            "acked_event_ids": result["acked_event_ids"],
            "processed_count": result["processed_count"],
            "skipped_count": result["skipped_count"],
            "errors": result["errors"],
            "last_applied_seq": last_applied_seq,
            "latest_seq": latest_seq,
            "server_events": serialized_new_events,
            "server_events_count": len(new_events),
        }, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────────────────────────────────────
# Sale & SaleItem ViewSets
# ─────────────────────────────────────────────────────────────────────────────

class SaleViewSet(viewsets.ModelViewSet):
    """
    /api/sales/

    List / retrieve / create / update / destroy Sales.

    Filtering:
      ?store=<id>          — filter by store
      ?status=COMPLETED    — filter by status (COMPLETED | VOIDED | RETURNED)
      ?payment_method=CASH — filter by payment method
      ?sold_at_after=<iso> — sales on or after this datetime
      ?sold_at_before=<iso>— sales on or before this datetime

    Search:
      ?search=<term>       — matches receipt_number, cashier_name, customer_name, store code/name

    Ordering:
      ?ordering=-sold_at   — default; also supports total_amount, created_at

    Uses SaleWriteSerializer for create/update (nested items accepted),
    and SaleSerializer for all read operations.
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['store', 'status', 'payment_method', 'sync_event']
    search_fields      = ['receipt_number', 'cashier_name', 'customer_name',
                          'store__name', 'store__code']
    ordering_fields    = ['sold_at', 'total_amount', 'created_at']
    ordering           = ['-sold_at']

    def get_queryset(self):
        qs = Sale.objects.select_related(
            'store', 'sync_event'
        ).prefetch_related(
            'items', 'items__variant', 'items__variant__product'
        ).all()

        sold_after  = self.request.query_params.get('sold_at_after')
        sold_before = self.request.query_params.get('sold_at_before')
        if sold_after:
            qs = qs.filter(sold_at__gte=sold_after)
        if sold_before:
            qs = qs.filter(sold_at__lte=sold_before)
        return qs

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return SaleWriteSerializer
        return SaleSerializer


class SaleItemViewSet(viewsets.ModelViewSet):
    """
    /api/sale-items/

    Manage individual line items within a Sale.
    Typically used to inspect or correct individual lines; bulk creation
    goes through POST /api/sales/ with nested items.

    Filtering:
      ?sale=<uuid>     — all items for a given Sale
      ?variant=<uuid>  — all sales of a given Variant
    """
    queryset = SaleItem.objects.select_related(
        'sale', 'sale__store',
        'variant', 'variant__product',
        'ledger_entry',
    ).all()
    serializer_class   = SaleItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends    = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields   = ['sale', 'variant']
    search_fields      = ['variant__sku', 'variant__barcode', 'variant__product__name',
                          'sale__receipt_number']
    ordering_fields    = ['id', 'quantity', 'unit_price', 'line_total']
