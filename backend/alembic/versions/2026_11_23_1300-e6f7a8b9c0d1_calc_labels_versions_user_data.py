"""calculator: formula labels, examples and versions; each person's tape, sheet and pins

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-11-23 13:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('calc_formulas') as b:
        b.add_column(sa.Column('labels', sa.JSON(), nullable=True))
        b.add_column(sa.Column('example', sa.JSON(), nullable=True))
        b.add_column(sa.Column('history', sa.JSON(), nullable=True))
    op.create_table(
        'calc_user_data',
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('tape', sa.JSON(), nullable=True),
        sa.Column('sheet', sa.JSON(), nullable=True),
        sa.Column('pins', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('user_id', name='pk_calc_user_data'),
    )


def downgrade() -> None:
    op.drop_table('calc_user_data')
    with op.batch_alter_table('calc_formulas') as b:
        b.drop_column('history')
        b.drop_column('example')
        b.drop_column('labels')
